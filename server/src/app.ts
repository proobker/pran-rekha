import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  ApiErrorSchema,
  SessionRequestSchema,
  type ActorRole
} from '@pran-rekha/contracts';
import type { Database } from './storage/database.js';
import { Repository } from './storage/repository.js';
import { hashPassword } from './storage/seed.js';
import { PlatformStore } from './platform/store.js';
import { platformRouter } from './platform/routes.js';
import { seedMedicationMatrix } from './platform/fixtures.js';

const COOKIE_NAME = 'pran_rekha_session';
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

type AuthenticatedActor = { id: string; display_name: string; role: ActorRole };
type Locals = { requestId: string; actor?: AuthenticatedActor; tokenHash?: string };

export type AppOptions = {
  database: Database;
  clock?: () => Date;
  secureCookies?: boolean;
  demoFixtures?: boolean;
};

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const part of header.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name) cookies[name] = decodeURIComponent(value.join('='));
  }
  return cookies;
}

function errorBody(code: 'INVALID_INPUT' | 'FORBIDDEN' | 'CONFLICT', message: string, requestId: string) {
  return ApiErrorSchema.parse({ error: { code, message, retryable: false }, requestId });
}

export async function createApp(options: AppOptions) {
  const app = express();
  const repository = new Repository(options.database);
  const platform = new PlatformStore(options.database);
  await platform.init();

  const isDemo = process.env.DEMO_MODE === 'true' || process.env.NODE_ENV !== 'production';
  const demoFixtures = options.demoFixtures ?? isDemo;
  if (process.env.NODE_ENV === 'production' && demoFixtures && process.env.DEMO_MODE !== 'true') {
    throw new Error('Demo fixtures cannot be enabled in production.');
  }
  if (process.env.NODE_ENV === 'production' && process.env.DEMO_MODE !== 'true') {
    const demoAccount = await options.database.queryOne(
      "SELECT 1 FROM actors WHERE username IN ('siddharth','paramedic','lab','hospital','approver','admin','maya.patient','demo.clinician') LIMIT 1"
    );
    const demoProfile = await options.database.queryOne(
      "SELECT 1 FROM platform_objects WHERE kind='profile' AND id='PR-9042-8819' LIMIT 1"
    );
    if (demoAccount || demoProfile) {
      throw new Error('This database contains built-in demo accounts or profiles; use a clean database in production.');
    }
  }
  if (demoFixtures) {
    await platform.seed();
    await seedMedicationMatrix(platform);
  }
  const clock = options.clock ?? (() => new Date());
  const secureCookies = options.secureCookies ?? process.env.NODE_ENV === 'production';

  app.disable('x-powered-by');
  app.use(express.json({ limit: '15mb' }));
  app.use((request, response, next) => {
    response.locals.requestId = request.header('x-request-id')?.slice(0, 128) || randomUUID();
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  const attempts = new Map<string, { count: number; until: number }>();
  app.use((request, response, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      const origin = request.header('origin');
      const allowed = (process.env.PUBLIC_ORIGIN ?? 'http://localhost:5173')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      if (process.env.RENDER_EXTERNAL_URL) {
        allowed.push(process.env.RENDER_EXTERNAL_URL.trim());
      }
      if (request.header('sec-fetch-site') === 'cross-site' || (origin && !allowed.includes(origin))) {
        response.status(403).json(errorBody('FORBIDDEN', 'Origin not allowed.', response.locals.requestId));
        return;
      }
    }
    next();
  });

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true });
  });

  async function authenticate(request: Request, response: Response<unknown, Locals>, next: NextFunction) {
    try {
      const rawToken = parseCookies(request.header('cookie'))[COOKIE_NAME];
      if (!rawToken) {
        response.status(401).json(errorBody('FORBIDDEN', 'The requested resource is unavailable.', response.locals.requestId));
        return;
      }
      const digest = tokenHash(rawToken);
      const actor = await repository.findActorBySessionHash(digest, clock().toISOString());
      if (!actor) {
        response.status(401).json(errorBody('FORBIDDEN', 'The requested resource is unavailable.', response.locals.requestId));
        return;
      }
      response.locals.actor = actor;
      response.locals.tokenHash = digest;
      next();
    } catch (error) {
      next(error);
    }
  }

  app.post('/api/session', async (request, response: Response<unknown, Locals>, next) => {
    try {
      const key = request.ip ?? 'local';
      const attempt = attempts.get(key);
      if (attempt && attempt.until > clock().getTime() && attempt.count >= 20) {
        response.status(429).json(errorBody('FORBIDDEN', 'Too many attempts. Try later.', response.locals.requestId));
        return;
      }
      attempts.set(key, { count: attempt && attempt.until > clock().getTime() ? attempt.count + 1 : 1, until: clock().getTime() + 60000 });
      const parsed = SessionRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json(errorBody('INVALID_INPUT', 'Credentials must contain only a username and password.', response.locals.requestId));
        return;
      }
      const actor = await repository.findActorByUsername(parsed.data.username);
      const suppliedHash = hashPassword(parsed.data.password, actor?.password_salt ?? 'pran-rekha-invalid-salt');
      const expectedHash = actor?.password_hash ?? '0'.repeat(64);
      const matches = timingSafeEqual(Buffer.from(suppliedHash, 'hex'), Buffer.from(expectedHash, 'hex'));
      if (!actor || !matches) {
        response.status(401).json(errorBody('FORBIDDEN', 'The credentials were not accepted.', response.locals.requestId));
        return;
      }

      const rawToken = randomBytes(32).toString('base64url');
      const createdAt = clock();
      const expiresAt = new Date(createdAt.getTime() + SESSION_DURATION_MS);
      await repository.createSession(tokenHash(rawToken), actor.id, createdAt.toISOString(), expiresAt.toISOString());
      response.cookie(COOKIE_NAME, rawToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: secureCookies,
        maxAge: SESSION_DURATION_MS,
        path: '/'
      });
      response.status(201).json({
        actor: { id: actor.id, displayName: actor.display_name, role: (await platform.staff(actor.id))?.role ?? actor.role },
        patientIds: await repository.patientIdsForActor(actor.id),
        mode: 'synthetic_fixture'
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/session', authenticate, async (_request, response: Response<unknown, Locals>, next) => {
    try {
      const actor = response.locals.actor!;
      response.json({
        actor: { id: actor.id, displayName: actor.display_name, role: (await platform.staff(actor.id))?.role ?? actor.role },
        patientIds: await repository.patientIdsForActor(actor.id),
        mode: 'synthetic_fixture'
      });
    } catch (error) {
      next(error);
    }
  });

  app.use('/api/platform', (request, response: Response<unknown, Locals>, next) => {
    if ((request.path === '/rfid/scans' && request.method === 'POST') || (request.path === '/rfid/display' && request.method === 'GET')) {
      next();
      return;
    }
    void authenticate(request, response, next);
  }, platformRouter(platform, clock));

  app.delete('/api/session', authenticate, async (_request, response: Response<unknown, Locals>, next) => {
    try {
      if (response.locals.tokenHash) await repository.deleteSession(response.locals.tokenHash);
      response.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax', secure: secureCookies, path: '/' });
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.use((_request, response: Response<unknown, Locals>) => {
    response.status(404).json(errorBody('FORBIDDEN', 'The requested resource is unavailable.', response.locals.requestId));
  });

  app.use((error: unknown, _request: Request, response: Response<unknown, Locals>, _next: NextFunction) => {
    console.error('Request failed', { requestId: response.locals.requestId, error: error instanceof Error ? error.message : 'unknown' });
    response.status(500).json(errorBody('CONFLICT', 'The request could not be completed.', response.locals.requestId));
  });

  return app;
}
