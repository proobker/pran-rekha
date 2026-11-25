import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { GrantRequestSchema, ScanSchema } from '@pran-rekha/contracts/platform';
import { digest, type PlatformStore, type Profile, type Staff } from './store.js';

const text = z.string().min(1).max(500);
type RequestRecord = { id: string; actor: string; patient: string; deviceId: string; releaseRevision: number; purpose: string; status: string; expiresAt: string; grantId?: string };

export function operationsRouter(store: PlatformStore, clock: () => Date) {
  const router = Router();
  router.post('/readers/provision', async (req, res, next) => {
    try {
      const s = res.locals.staff as Staff;
      if (s.role !== 'admin') throw new Error('FORBIDDEN');
      const input = z.object({ id: text, actorId: text }).strict().parse(req.body);
      const target = await store.staff(input.actorId);
      if (!target || target.role !== 'paramedic') throw new Error('INVALID_INPUT');
      const token = randomUUID() + randomUUID();
      await store.transaction(async () => {
        await store.put('reader', input.id, { id: input.id, tokenHash: digest(token), revoked: false, lastSeen: null });
        await store.db.run('UPDATE portal_roles SET reader=? WHERE actor_id=?', [input.id, target.id]);
      });
      res.json({ deviceId: input.id, token });
    } catch (e) { next(e); }
  });
  router.post('/tags', async (req, res, next) => {
    try {
      const s = res.locals.staff as Staff;
      if (s.role !== 'admin') throw new Error('FORBIDDEN');
      const input = z.object({ tagUid: ScanSchema.shape.tagUid, patientId: text, revoked: z.boolean() }).strict().parse(req.body);
      if (!(await store.get('profile', input.patientId))) throw new Error('FORBIDDEN');
      await store.put('tag', input.tagUid, { patientId: input.patientId, revoked: input.revoked });
      res.json({ updated: true });
    } catch (e) { next(e); }
  });
  router.post('/break-glass', async (req, res, next) => {
    try {
      const s = res.locals.staff as Staff, input = GrantRequestSchema.parse(req.body);
      if (!['clinician', 'paramedic'].includes(s.role)) throw new Error('FORBIDDEN');
      const link = await store.get<{ actor: string; patient: string; expiresAt: string }>('link', input.linkageId);
      if (!link || link.actor !== s.id || link.patient !== input.patientId || Date.parse(link.expiresAt) <= clock().getTime()) throw new Error('FORBIDDEN');
      const p = await store.get<Profile>('profile', input.patientId);
      if (!p || p.release.revoked) throw new Error('GRANT_REVOKED');
      if (!p.release.allowedEntryIds.length) throw new Error('NO_APPROVED_SCOPE');
      res.json(await store.mutate(s.id, input.requestId, input, async () => {
        const pending: RequestRecord = { id: randomUUID(), actor: s.id, patient: p.id, purpose: input.purpose, deviceId: input.deviceId, releaseRevision: p.release.revision, status: 'PENDING', expiresAt: new Date(clock().getTime() + 300000).toISOString() };
        await store.put('break-glass', pending.id, pending);
        await store.put('break-glass-session', pending.id, { sessionHash: res.locals.tokenHash });
        return pending;
      }));
    } catch (e) { next(e); }
  });
  router.get('/break-glass', async (_req, res, next) => {
    try {
      const s = res.locals.staff as Staff;
      if (s.role !== 'clinician' || s.facility !== 'hospital-demo') throw new Error('FORBIDDEN');
      const requests = (await store.all<RequestRecord>('break-glass')).filter((r) => r.status === 'PENDING' && r.actor !== s.id);
      const out = [];
      for (const r of requests) {
        out.push({ ...r, approvedEntryCount: (await store.get<Profile>('profile', r.patient))?.release.allowedEntryIds.length ?? 0 });
      }
      res.json(out);
    } catch (e) { next(e); }
  });
  router.post('/break-glass/:id/approve', async (req, res, next) => {
    try {
      const s = res.locals.staff as Staff, input = z.object({ requestId: text }).strict().parse(req.body), id = String(req.params.id);
      if (s.role !== 'clinician' || s.facility !== 'hospital-demo') throw new Error('FORBIDDEN');
      res.json(await store.mutate(s.id, input.requestId, { id, ...input }, async () => {
        const b = await store.get<RequestRecord>('break-glass', id);
        if (!b || b.actor === s.id) throw new Error('FORBIDDEN');
        if (b.status !== 'PENDING' || Date.parse(b.expiresAt) <= clock().getTime()) throw new Error('CONFLICT');
        const p = await store.get<Profile>('profile', b.patient);
        if (!p || p.release.revoked || p.release.revision !== b.releaseRevision) throw new Error('GRANT_REVOKED');
        const g = { id: randomUUID(), actor: b.actor, patient: b.patient, deviceId: b.deviceId, releaseRevision: b.releaseRevision, purpose: b.purpose, expiresAt: new Date(clock().getTime() + 300000).toISOString() };
        const binding = await store.get<{ sessionHash: string }>('break-glass-session', id);
        if (!binding) throw new Error('FORBIDDEN');
        await store.put('grant', g.id, g);
        await store.put('grant-session', g.id, binding);
        await store.put('break-glass', id, { ...b, status: 'APPROVED', approvedBy: s.id, grantId: g.id });
        await store.put('notification', id, { id, patientId: p.id, status: 'PENDING', channel: 'demo_outbox', at: clock().toISOString() });
        await store.receipt(p.id, s.id, 'Break-glass approval', [], clock(), { requester: b.actor });
        return { grantId: g.id, status: 'APPROVED' };
      }));
    } catch (e) { next(e); }
  });
  router.get('/break-glass/:id', async (req, res, next) => {
    try {
      const s = res.locals.staff as Staff, b = await store.get<RequestRecord>('break-glass', String(req.params.id));
      if (!b || b.actor !== s.id) throw new Error('FORBIDDEN');
      res.json(b);
    } catch (e) { next(e); }
  });
  router.post('/offline/status', async (req, res, next) => {
    try {
      const s = res.locals.staff as Staff, input = z.object({ snapshotId: text }).strict().parse(req.body);
      const snapshot = await store.get<{ actorId: string; releaseRevision: number; card: { patientId: string } }>('snapshot', input.snapshotId);
      if (!snapshot || snapshot.actorId !== s.id) throw new Error('FORBIDDEN');
      const p = await store.get<Profile>('profile', snapshot.card.patientId);
      res.json({ revoked: !p || p.release.revoked || p.release.revision !== snapshot.releaseRevision });
    } catch (e) { next(e); }
  });
  return router;
}
