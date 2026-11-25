import { Router } from 'express';
import { randomBytes, randomInt, randomUUID, sign } from 'node:crypto';
import { z } from 'zod';
import { CardSchema, DispatchRequestSchema, EntrySchema, FaceEnrollmentSchema, GrantRequestSchema, HandwrittenUpdateSchema, PlatformProfileSchema, RegisterPatientSchema, ReleaseRequestSchema, ScanSchema, SignRequestSchema, type Alert } from '@pran-rekha/contracts/platform';
import { canonical, digest, freshness, NOTICE, PlatformStore, sixMonths, type Profile, type Staff } from './store.js';
import { hashPassword } from '../storage/seed.js';
import { intakeRouter } from './intake.js';
import { operationsRouter } from './operations.js';
import { medicationsRouter } from './medications.js';
import { lifecycle, type LifecycleEvent } from '@pran-rekha/domain';
import type { MedicationRecord } from '@pran-rekha/contracts';

type Grant = { id: string; actor: string; patient: string; deviceId: string; releaseRevision: number; expiresAt: string; purpose: string };
type Linkage = { id: string; actor: string; patient: string; expiresAt: string; rfid?: { deviceId: string; eventId: string } };
type Scan = { deviceId: string; tagUid: string; eventId: string; receivedAt: string };
type ReaderDisplay = { grantId: string; expiresAt: string };
type Face = { patientId: string; descriptor: number[]; photo: string; photoSha256: string; createdBy: string; createdAt: string };
type HandwrittenSource = { id: string; patientId: string; image: string; sha256: string; ocrText: string; engine: string; actorId: string; at: string; sourceType: 'handwritten_note' | 'lab_report'; reportSource?: string; reportNumber?: string };
type Reader = { id: string; tokenHash: string; revoked: boolean; lastSeen: string | null };

const text = z.string().min(1).max(500);
const mutation = z.object({ requestId: text, expectedRevision: z.number().int().nonnegative() });
const unavailable = (): never => { throw new Error('FORBIDDEN'); };
const hospitalStaff = (s: Staff) => s.role === 'clinician' && s.facility === 'hospital-demo';
const jpegBytes = (dataUrl: string) => Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');

export function platformRouter(store: PlatformStore, clock: () => Date) {
  const router = Router();
  // Alert changes wake SSE subscribers; payloads stay out of the stream.
  const listeners = new Set<(event: 'refresh' | 'release-change') => void>();
  const notify = (event: 'refresh' | 'release-change' = 'refresh') => { for (const listener of listeners) listener(event); };
  const faceRetentionMs = 30 * 86400000;
  const purgeExpiredFaces = async () => {
    for (const face of await store.all<Face>('face')) {
      if (Date.parse(face.createdAt) <= clock().getTime() - faceRetentionMs) {
        await store.db.run('DELETE FROM platform_objects WHERE kind=? AND id=?', ['face', face.patientId]);
        await store.receipt(face.patientId, 'system', 'Face enrollment expired after 30 days', [], clock());
      }
    }
  };
  const faceCleanup = setInterval(() => { void purgeExpiredFaces().catch(() => {}); }, 3600000);
  faceCleanup.unref?.();

  async function profile(id: string): Promise<Profile> {
    const p = await store.get<Profile>('profile', id);
    if (!p) return unavailable();
    return p;
  }
  async function owner(actor: string, pid: string): Promise<boolean> {
    return Boolean(await store.db.queryOne('SELECT 1 FROM actor_patient_bindings WHERE actor_id=? AND patient_id=?', [actor, pid]));
  }
  async function allowedFull(staff: Staff, pid: string): Promise<boolean> {
    if (await owner(staff.id, pid)) return true;
    return (await store.all<{ actor: string; patient: string }>('assignment')).some((a) => a.actor === staff.id && a.patient === pid);
  }
  async function project(pid: string, actor: string, purpose: string, expiresAt: string) {
    const p = await profile(pid);
    if (p.release.revoked) throw new Error('GRANT_REVOKED');
    if (!(await store.verifyProfile(p))) throw new Error('SIGNATURE_INVALID');
    const medEvents = await store.all<LifecycleEvent>('med-event');
    const entries = [];
    for (const entry of p.entries.filter((e) => p.release.allowedEntryIds.includes(e.id))) {
      if (entry.kind !== 'medication') {
        entries.push(entry);
        continue;
      }
      const record = await store.get<MedicationRecord>('med-record', entry.id);
      if (!record) {
        entries.push(entry);
        continue;
      }
      const view = lifecycle(record, medEvents, clock().toISOString());
      entries.push({ ...entry, text: entry.text + ' · ' + view.state + ' · actual use not established' });
    }
    const receiptId = await store.receipt(pid, actor, purpose, entries.map((e) => e.id), clock());
    return CardSchema.parse({ ...(p.demo ? { demo: true } : {}), patientId: pid, name: p.name, entries, notice: (p.demo ? 'FICTIONAL DEMO DATA - not medical history. ' : '') + NOTICE + ' Each item has its own recorded date and source. Verify that it is current and clinically relevant before use.', generatedAt: clock().toISOString(), expiresAt, receiptId });
  }
  async function grant(id: string, actor: string, sessionHash: string): Promise<Grant> {
    const g = await store.get<Grant>('grant', id);
    const binding = await store.get<{ sessionHash: string }>('grant-session', id);
    if (!g || g.actor !== actor || !binding || binding.sessionHash !== sessionHash) return unavailable();
    if (Date.parse(g.expiresAt) <= clock().getTime()) throw new Error('GRANT_EXPIRED');
    const p = await profile(g.patient);
    if (p.release.revoked || p.release.revision !== g.releaseRevision) throw new Error('GRANT_REVOKED');
    return g;
  }
  // Signs clinician-confirmed entries into a new profile version; callers run inside store.mutate.
  async function commitSigned(s: Staff, pid: string, expectedRevision: number, entries: z.infer<typeof EntrySchema>[]) {
    const p = await profile(pid);
    if (p.revision !== expectedRevision) throw new Error('CONFLICT');
    const version = await store.signVersion({ id: randomUUID(), patientId: pid, revision: p.revision + 1, facility: s.facility, signer: s.id, signedAt: clock().toISOString(), reviewDue: sixMonths(clock()).toISOString(), entries });
    p.entries.push(...entries);
    p.versions.push(version);
    p.revision++;
    p.reviewDue = version.reviewDue;
    await store.put('profile', pid, p);
    return version;
  }
  const signingClinician = async (s: Staff, pid: string) => s.role === 'clinician' && ['lab-demo', 'hospital-demo'].includes(s.facility) && await allowedFull(s, pid);

  // Device endpoint accepts scan events only. It never returns linkage or records.
  router.post('/rfid/scans', async (req, res, next) => {
    try {
      const input = ScanSchema.parse(req.body), reader = await store.get<Reader>('reader', input.deviceId);
      if (!reader || reader.revoked || digest(req.header('authorization')?.replace(/^Bearer /, '') ?? '') !== reader.tokenHash) return unavailable();
      const result = await store.mutate('device:' + reader.id, input.eventId, input, async () => {
        reader.lastSeen = clock().toISOString();
        await store.put('reader', reader.id, reader);
        await store.put('scan', input.eventId, { ...input, receivedAt: reader.lastSeen });
        await store.put('reader-scan', reader.id, { eventId: input.eventId });
        return { accepted: true, eventId: input.eventId };
      });
      res.json(result);
    } catch (e) { next(e); }
  });

  // Medical details require approval. Explicitly enrolled demo cards may show
  // their name on the designated reader while waiting for approval.
  router.get('/rfid/display', async (req, res, next) => {
    try {
      const input = z.object({ deviceId: ScanSchema.shape.deviceId, eventId: ScanSchema.shape.eventId.optional() }).strict().parse(req.query);
      const reader = await store.get<Reader>('reader', input.deviceId);
      if (!reader || reader.revoked || digest(req.header('authorization')?.replace(/^Bearer /, '') ?? '') !== reader.tokenHash) return unavailable();
      const lastSeenMs = reader.lastSeen ? Date.parse(reader.lastSeen) : 0;
      if (!lastSeenMs || clock().getTime() - lastSeenMs >= 30_000) {
        reader.lastSeen = clock().toISOString();
        await store.put('reader', reader.id, reader);
      }
      if (!input.eventId) { res.json({ state: 'READY' }); return; }
      const scan = await store.get<Scan>('scan', input.eventId);
      const latest = await store.get<{ eventId: string }>('reader-scan', reader.id);
      if (!scan || scan.deviceId !== reader.id || latest?.eventId !== scan.eventId || Date.parse(scan.receivedAt) <= clock().getTime() - 240000) { res.json({ state: 'EXPIRED' }); return; }
      const tag = await store.get<{ patientId: string; revoked: boolean }>('tag', scan.tagUid);
      if (!tag || tag.revoked) { res.json({ state: 'UNKNOWN_TAG' }); return; }
      const display = await store.get<ReaderDisplay>('reader-display', reader.id + ':' + scan.eventId);
      if (!display) {
        if (Date.parse(scan.receivedAt) <= clock().getTime() - 120000) { res.json({ state: 'EXPIRED' }); return; }
        const enrollment = await store.get<{ patientId: string; deviceId: string }>('demo-name-display', scan.tagUid);
        const candidate = await store.get<Profile>('profile', tag.patientId);
        if (enrollment?.patientId === tag.patientId && enrollment.deviceId === reader.id && candidate?.demo && !candidate.release.revoked) {
          if (!(await store.verifyProfile(candidate))) throw new Error('SIGNATURE_INVALID');
          res.json({ state: 'WAITING_APPROVAL', name: candidate.name, demo: true });
          return;
        }
        res.json({ state: 'WAITING_APPROVAL' });
        return;
      }
      const g = await store.get<Grant>('grant', display.grantId);
      const binding = g && await store.get<{ sessionHash: string }>('grant-session', g.id);
      const p = await store.get<Profile>('profile', tag.patientId);
      const granteeStaff = g ? await store.staff(g.actor) : undefined;
      const activeSession = binding && g
        ? await store.db.queryOne('SELECT 1 FROM sessions WHERE token_hash=? AND actor_id=? AND expires_at>?', [binding.sessionHash, g.actor, clock().toISOString()])
        : undefined;
      if (!g || !p || g.patient !== tag.patientId || granteeStaff?.reader !== reader.id || !binding
        || !activeSession
        || Date.parse(display.expiresAt) <= clock().getTime() || Date.parse(g.expiresAt) <= clock().getTime()
        || p.release.revoked || p.release.revision !== g.releaseRevision) { res.json({ state: 'EXPIRED' }); return; }
      const card = await store.transaction(async () => project(g.patient, g.actor, 'RFID LCD: ' + g.purpose, display.expiresAt));
      res.json({ state: 'AUTHORIZED', expiresAt: display.expiresAt, card });
    } catch (e) { next(e); }
  });

  router.use(async (req, res, next) => {
    try {
      const actor = res.locals.actor as { id: string } | undefined;
      if (!actor) { res.status(401).json({ error: { code: 'FORBIDDEN', message: 'Resource unavailable.', retryable: false }, requestId: randomUUID() }); return; }
      res.locals.staff = (await store.staff(actor.id)) ?? { id: actor.id, role: 'patient', facility: '', unit: '', reader: '' };
      next();
    } catch (e) { next(e); }
  });

  router.use(intakeRouter(store, clock));
  router.use(operationsRouter(store, clock));
  router.use(medicationsRouter(store, clock));

  router.get('/context', async (_req, res, next) => {
    try {
      const s = res.locals.staff as Staff;
      const profiles = await store.all<Profile>('profile');
      const patients = [];
      for (const p of profiles) {
        if (await allowedFull(s, p.id)) patients.push({ id: p.id, name: p.name });
      }
      res.json({ staff: s, patients, destinations: [{ id: 'hospital-demo', name: 'Pran Rekha Demonstration Hospital' }] });
    } catch (e) { next(e); }
  });

  router.get('/profiles/:id', async (req, res, next) => {
    try {
      const s = res.locals.staff as Staff;
      const p = await profile(String(req.params.id));
      if (!(await allowedFull(s, p.id))) return unavailable();
      if (!(await store.verifyProfile(p))) throw new Error('SIGNATURE_INVALID');
      res.json(PlatformProfileSchema.parse({ ...p, freshness: freshness(p.reviewDue, clock()) }));
    } catch (e) { next(e); }
  });

  router.post('/profiles/:id/sign', async (req, res, next) => {
    try {
      const s = res.locals.staff as Staff, pid = String(req.params.id), input = SignRequestSchema.parse(req.body);
      if (s.role !== 'clinician' || s.facility !== 'lab-demo' || !(await allowedFull(s, pid))) return unavailable();
      const result = await store.mutate(s.id, input.requestId, { pid, ...input }, async () => {
        const version = await commitSigned(s, pid, input.expectedRevision, input.entries.map((e) => ({ ...e, id: randomUUID(), author: s.id, reviewed: true })));
        await store.put('ledger', version.id, { id: version.id, facility: s.facility, patientId: pid, amountMinor: 5000, commissionMinor: 400, currency: 'USD', simulated: true, at: clock().toISOString() });
        return version;
      });
      notify();
      res.json(result);
    } catch (e) { next(e); }
  });

  // Handwritten prescription/card: local OCR candidates confirmed line by line by the clinician, original image retained.
  router.post('/profiles/:id/handwritten', async (req, res, next) => {
    try {
      const s = res.locals.staff as Staff, pid = String(req.params.id);
      if (!(await signingClinician(s, pid))) return unavailable();
      const input = HandwrittenUpdateSchema.parse(req.body);
      if (input.sourceType === 'lab_report' && input.patientIdentityVerified !== true) throw new Error('IDENTITY_CONFIRMATION_REQUIRED');
      if (jpegBytes(input.image).subarray(0, 3).toString('hex') !== 'ffd8ff') throw new Error('INVALID_INPUT');
      res.json(await store.mutate(s.id, input.requestId, { pid, ...input, image: digest(input.image) }, async () => {
        const source: HandwrittenSource = { id: randomUUID(), patientId: pid, image: input.image, sha256: digest(input.image), ocrText: input.ocrText, engine: input.engine, actorId: s.id, at: clock().toISOString(), sourceType: input.sourceType, ...(input.reportSource ? { reportSource: input.reportSource } : {}), ...(input.reportNumber ? { reportNumber: input.reportNumber } : {}) };
        const sourceKind = input.sourceType === 'lab_report' ? 'lab-report-source' : 'handwritten-source';
        const sourceLabel = input.sourceType === 'lab_report' ? `Laboratory report${input.reportSource ? ' · ' + input.reportSource : ''}${input.reportNumber ? ' · ' + input.reportNumber : ''} · OCR candidate checked by lab clinician` : 'Handwritten note · OCR candidate confirmed by clinician';
        const entries = input.entries.map((e) => EntrySchema.parse({ id: randomUUID(), kind: e.kind, text: e.text, date: e.date, source: sourceLabel, excerpt: e.original.trim() || e.text, author: s.id, reviewed: true }));
        const version = await commitSigned(s, pid, input.expectedRevision, entries);
        await store.put(sourceKind, source.id, source);
        for (const entry of entries) await store.put('source-reference', entry.id, { sourceId: source.id, sourceType: input.sourceType, sha256: source.sha256, engine: source.engine, mode: 'ocr_candidate_confirmed' });
        await store.receipt(pid, s.id, input.sourceType === 'lab_report' ? 'Lab report reviewed and signed' : 'Handwritten note signed', entries.map((e) => e.id), clock());
        return { version, sourceId: source.id, sourceType: input.sourceType, entryIds: entries.map((e) => e.id) };
      }));
    } catch (e) { next(e); }
  });

  router.get('/handwritten/:id/image', async (req, res, next) => {
    try {
      const s = res.locals.staff as Staff, src = await store.get<HandwrittenSource>('handwritten-source', String(req.params.id));
      if (!src || !((await owner(s.id, src.patientId)) || (await signingClinician(s, src.patientId)))) return unavailable();
      res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' }).send(jpegBytes(src.image));
    } catch (e) { next(e); }
  });

  router.get('/lab-reports/:id/image', async (req, res, next) => {
    try {
      const s = res.locals.staff as Staff, src = await store.get<HandwrittenSource>('lab-report-source', String(req.params.id));
      if (!src || !(await signingClinician(s, src.patientId))) return unavailable();
      await store.receipt(src.patientId, s.id, 'Lab report image viewed', [], clock());
      res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' }).send(jpegBytes(src.image));
    } catch (e) { next(e); }
  });

  router.post('/profiles/:id/reports', async (req, res, next) => {
    try {
      const s = res.locals.staff as Staff, pid = String(req.params.id);
      const input = mutation.extend({ text: z.string().min(1).max(2000), date: z.iso.date() }).strict().parse(req.body);
      if (!(await owner(s.id, pid))) return unavailable();
      const result = await store.mutate(s.id, input.requestId, { pid, ...input }, async () => {
        const p = await profile(pid);
        if (p.revision !== input.expectedRevision) throw new Error('CONFLICT');
        const entry = EntrySchema.parse({ id: randomUUID(), kind: 'report', text: input.text, date: input.date, source: 'Patient attestation', excerpt: input.text, author: s.id, reviewed: false });
        p.entries.push(entry);
        p.revision++;
        await store.put('profile', pid, p);
        return entry;
      });
      res.json(result);
    } catch (e) { next(e); }
  });

  router.post('/profiles/:id/release', async (req, res, next) => {
    try {
      const s = res.locals.staff as Staff, pid = String(req.params.id), input = ReleaseRequestSchema.parse(req.body);
      if (!(await owner(s.id, pid))) return unavailable();
      const result = await store.mutate(s.id, input.requestId, { pid, ...input }, async () => {
        const p = await profile(pid);
        if (p.revision !== input.expectedRevision) throw new Error('CONFLICT');
        if (input.allowedEntryIds.some((id) => !p.entries.some((e) => e.id === id))) throw new Error('INVALID_INPUT');
        p.release = { revision: p.release.revision + 1, allowedEntryIds: [...new Set(input.allowedEntryIds)], revoked: false };
        p.revision++;
        await store.put('profile', pid, p);
        return p.release;
      });
      notify('release-change');
      res.json(result);
    } catch (e) { next(e); }
  });

  router.post('/profiles/:id/revoke', async (req, res, next) => {
    try {
      const s = res.locals.staff as Staff, pid = String(req.params.id), input = mutation.strict().parse(req.body);
      if (!(await owner(s.id, pid))) return unavailable();
      const result = await store.mutate(s.id, input.requestId, { pid, ...input }, async () => {
        const p = await profile(pid);
        if (p.revision !== input.expectedRevision) throw new Error('CONFLICT');
        p.release.revoked = true;
        p.release.revision++;
        p.revision++;
        await store.put('profile', pid, p);
        return { revoked: true };
      });
      notify('release-change');
      res.json(result);
    } catch (e) { next(e); }
  });

  router.get('/profiles/:id/receipts', async (req, res, next) => {
    try {
      const s = res.locals.staff as Staff, pid = String(req.params.id);
      if (!(await owner(s.id, pid))) return unavailable();
      const rows = await store.db.queryAll<{ body: string }>('SELECT body FROM platform_receipts WHERE patient_id=? ORDER BY rowid DESC', [pid]);
      res.json(rows.map((r) => JSON.parse(r.body)));
    } catch (e) { next(e); }
  });

  // Hospital registration creates a synthetic record and a patient login; emergency release starts empty until the patient opts in.
  router.post('/patients', async (req, res, next) => {
    try {
      const s = res.locals.staff as Staff;
      if (!hospitalStaff(s)) return unavailable();
      const input = RegisterPatientSchema.parse(req.body);
      if (input.photo && jpegBytes(input.photo).subarray(0, 3).toString('hex') !== 'ffd8ff') throw new Error('INVALID_INPUT');
      res.json(await store.mutate(s.id, input.requestId, { ...input, password: digest(input.password) }, async () => {
        const actorId = 'portal-' + input.username;
        if (await store.db.queryOne('SELECT 1 FROM actors WHERE id=? OR username=?', [actorId, input.username])) throw new Error('CONFLICT');
        if (input.tagUid && await store.get('tag', input.tagUid)) throw new Error('CONFLICT');
        let pid: string;
        do pid = 'PR-' + randomInt(1000, 10000) + '-' + randomInt(1000, 10000); while (await store.get('profile', pid));
        const salt = randomBytes(16).toString('hex'), date = clock().toISOString().slice(0, 10);
        await store.db.run('INSERT INTO patients VALUES(?,?,?,?)', [pid, input.name, null, 'synthetic_fixture']);
        await store.db.run('INSERT INTO actors VALUES(?,?,?,?,?,?)', [actorId, input.username, input.name, 'patient', salt, hashPassword(input.password, salt)]);
        await store.db.run('INSERT INTO portal_roles VALUES(?,?,?,?,?)', [actorId, 'patient', '', '', '']);
        await store.db.run('INSERT INTO actor_patient_bindings VALUES(?,?)', [actorId, pid]);
        const source = 'Pran Rekha Demonstration Hospital · registration';
        const entries = ([['blood_group', input.bloodGroup], ['allergy', input.allergies]] as const).filter(([, value]) => value).map(([kind, value]) => EntrySchema.parse({ id: randomUUID(), kind, text: value, date, source, excerpt: value, author: s.id, reviewed: true }));
        const reviewDue = sixMonths(clock()).toISOString();
        const versions = entries.length ? [await store.signVersion({ id: randomUUID(), patientId: pid, revision: 1, facility: s.facility, signer: s.id, signedAt: clock().toISOString(), reviewDue, entries })] : [];
        const locator = 'opaque-' + randomUUID();
        await store.put('profile', pid, { id: pid, name: input.name, dob: input.dob, locator, revision: 1, entries, versions, reviewDue, release: { revision: 1, allowedEntryIds: [], revoked: false } } satisfies Profile);
        if (input.tagUid) await store.put('tag', input.tagUid, { patientId: pid, revoked: false });
        // The registering clinician may update this patient's record (e.g. handwritten notes).
        await store.put('assignment', 'hospital:' + pid, { actor: s.id, patient: pid });
        // With consent, the photo and descriptor are stored in the demo database and served to hospital staff only.
        if (input.photo && input.descriptor) await store.put('face', pid, { patientId: pid, descriptor: input.descriptor, photo: input.photo, photoSha256: digest(input.photo), createdBy: s.id, createdAt: clock().toISOString() } satisfies Face);
        await store.receipt(pid, s.id, 'Hospital patient registration', [], clock());
        return { patientId: pid, name: input.name, locator, username: input.username };
      }));
    } catch (e) { next(e); }
  });

  router.post('/profiles/:id/face', async (req, res, next) => {
    try {
      const s = res.locals.staff as Staff, pid = String(req.params.id);
      if (!hospitalStaff(s) || !(await allowedFull(s, pid))) return unavailable();
      const input = FaceEnrollmentSchema.parse(req.body);
      if (jpegBytes(input.photo).subarray(0, 3).toString('hex') !== 'ffd8ff') throw new Error('INVALID_INPUT');
      await profile(pid);
      res.json(await store.mutate(s.id, input.requestId, { pid, ...input }, async () => {
        await store.put('face', pid, { patientId: pid, photo: input.photo, descriptor: input.descriptor, photoSha256: digest(input.photo), createdBy: s.id, createdAt: clock().toISOString() } satisfies Face);
        await store.receipt(pid, s.id, 'Face enrollment updated', [], clock());
        return { patientId: pid, updated: true };
      }));
    } catch (e) { next(e); }
  });

  router.get('/profiles/:id/lab-access', async (req, res, next) => {
    try {
      const s = res.locals.staff as Staff, pid = String(req.params.id);
      if (!hospitalStaff(s) || !(await allowedFull(s, pid))) return unavailable();
      res.json({ assigned: (await store.all<{ actor: string; patient: string }>('assignment')).some((a) => a.actor === 'portal-lab' && a.patient === pid) });
    } catch (e) { next(e); }
  });

  router.post('/profiles/:id/lab-access', async (req, res, next) => {
    try {
      const s = res.locals.staff as Staff, pid = String(req.params.id), input = z.object({ requestId: text, active: z.boolean() }).strict().parse(req.body);
      if (!hospitalStaff(s) || !(await allowedFull(s, pid))) return unavailable();
      const lab = await store.staff('portal-lab');
      if (!lab || lab.role !== 'clinician' || lab.facility !== 'lab-demo') return unavailable();
      const result = await store.mutate(s.id, input.requestId, { pid, active: input.active }, async () => {
        await profile(pid);
        if (input.active) {
          await store.put('assignment', 'lab:' + pid, { actor: lab.id, patient: pid });
        } else {
          const rows = await store.db.queryAll<{ id: string; body: string }>('SELECT id,body FROM platform_objects WHERE kind=?', ['assignment']);
          for (const row of rows) {
            const assignment = JSON.parse(row.body) as { actor: string; patient: string };
            if (assignment.actor === lab.id && assignment.patient === pid) {
              await store.db.run('DELETE FROM platform_objects WHERE kind=? AND id=?', ['assignment', row.id]);
            }
          }
        }
        await store.receipt(pid, s.id, input.active ? 'Patient assigned to demo laboratory' : 'Patient removed from demo laboratory assignment', [], clock(), { labActor: lab.id });
        return { patientId: pid, assigned: input.active };
      });
      notify();
      res.json(result);
    } catch (e) { next(e); }
  });

  router.get('/faces', async (_req, res, next) => {
    try {
      const s = res.locals.staff as Staff;
      if (!hospitalStaff(s)) return unavailable();
      await purgeExpiredFaces();
      res.setHeader('Cache-Control', 'no-store');
      const faces = await store.all<Face>('face');
      const out = [];
      for (const f of faces) {
        if (await allowedFull(s, f.patientId)) {
          out.push({ patientId: f.patientId, name: (await store.get<Profile>('profile', f.patientId))?.name ?? f.patientId, descriptor: f.descriptor });
        }
      }
      res.json(out);
    } catch (e) { next(e); }
  });

  router.get('/faces/:id/photo', async (req, res, next) => {
    try {
      const s = res.locals.staff as Staff;
      if (!hospitalStaff(s)) return unavailable();
      await purgeExpiredFaces();
      const face = await store.get<Face>('face', String(req.params.id));
      if (!face || !(await allowedFull(s, face.patientId))) return unavailable();
      await store.receipt(face.patientId, s.id, 'Face photo viewed', [], clock());
      res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' }).send(jpegBytes(face.photo));
    } catch (e) { next(e); }
  });

  router.get('/profiles/:id/face', async (req, res, next) => {
    try {
      const s = res.locals.staff as Staff, pid = String(req.params.id);
      if (!(await owner(s.id, pid))) return unavailable();
      await purgeExpiredFaces();
      const face = await store.get<Face>('face', pid);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ enrolled: Boolean(face), expiresAt: face ? new Date(Date.parse(face.createdAt) + faceRetentionMs).toISOString() : null });
    } catch (e) { next(e); }
  });

  router.delete('/profiles/:id/face', async (req, res, next) => {
    try {
      const s = res.locals.staff as Staff, pid = String(req.params.id), input = z.object({ requestId: text }).strict().parse(req.body);
      if (!(await owner(s.id, pid))) return unavailable();
      const result = await store.mutate(s.id, input.requestId, { pid }, async () => {
        const deleted = (await store.db.run('DELETE FROM platform_objects WHERE kind=? AND id=?', ['face', pid])).changes > 0;
        if (deleted) await store.receipt(pid, s.id, 'Face enrollment deleted by patient', [], clock());
        return { deleted };
      });
      res.json(result);
    } catch (e) { next(e); }
  });

  router.post('/linkage', async (req, res, next) => {
    try {
      const s = res.locals.staff as Staff;
      if (!['paramedic', 'clinician'].includes(s.role)) return unavailable();
      const input = z.object({ locator: text }).strict().parse(req.body);
      const p = (await store.all<Profile>('profile')).find((p) => p.locator === input.locator);
      if (!p) return unavailable();
      const link: Linkage = { id: randomUUID(), actor: s.id, patient: p.id, expiresAt: new Date(clock().getTime() + 120000).toISOString() };
      await store.put('link', link.id, link);
      res.json({ linkageId: link.id, patientId: p.id });
    } catch (e) { next(e); }
  });

  router.get('/rfid/pending', async (_req, res, next) => {
    try {
      const s = res.locals.staff as Staff;
      if (!s.reader) return unavailable();
      const reader = await store.get<Reader>('reader', s.reader);
      if (!reader || reader.revoked) return unavailable();
      const scans = (await store.all<Scan>('scan')).filter((e) => e.deviceId === s.reader && Date.parse(e.receivedAt) > clock().getTime() - 120000).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
      const latest = await store.get<{ eventId: string }>('reader-scan', s.reader);
      const scan = latest ? scans.find((e) => e.eventId === latest.eventId) : scans[0];
      if (!scan) { res.json({ state: reader.lastSeen && Date.parse(reader.lastSeen) > clock().getTime() - 60000 ? 'READY' : 'DISCONNECTED' }); return; }
      const tag = await store.get<{ patientId: string; revoked: boolean }>('tag', scan.tagUid);
      if (!tag || tag.revoked) { res.json({ state: 'UNKNOWN_TAG', eventId: scan.eventId }); return; }
      const link: Linkage = { id: randomUUID(), actor: s.id, patient: tag.patientId, expiresAt: new Date(clock().getTime() + 120000).toISOString(), rfid: { deviceId: s.reader, eventId: scan.eventId } };
      await store.put('link', link.id, link);
      res.json({ state: 'CANDIDATE', eventId: scan.eventId, patientId: tag.patientId, linkageId: link.id });
    } catch (e) { next(e); }
  });

  router.get('/rfid/latest', async (_req, res, next) => {
    try {
      const s = res.locals.staff as Staff;
      if (!['paramedic', 'clinician'].includes(s.role)) return unavailable();
      const scans = (await store.all<Scan>('scan'))
        .filter((e) => Date.parse(e.receivedAt) > clock().getTime() - 300000)
        .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
      const scan = scans[0];
      if (!scan) { res.json({ state: 'NO_SCANS' }); return; }
      const tag = await store.get<{ patientId: string; revoked: boolean }>('tag', scan.tagUid);
      const p = tag && !tag.revoked ? await store.get<Profile>('profile', tag.patientId) : undefined;
      res.json({
        state: 'FOUND',
        tagUid: scan.tagUid,
        deviceId: scan.deviceId,
        receivedAt: scan.receivedAt,
        secondsAgo: Math.max(0, Math.round((clock().getTime() - Date.parse(scan.receivedAt)) / 1000)),
        linkedPatient: p ? { id: p.id, name: p.name } : undefined
      });
    } catch (e) { next(e); }
  });

  router.post('/rfid/bind', async (req, res, next) => {
    try {
      const s = res.locals.staff as Staff;
      if (!hospitalStaff(s) && s.role !== 'clinician') return unavailable();
      const input = z.object({
        requestId: text,
        patientId: text,
        tagUid: ScanSchema.shape.tagUid
      }).strict().parse(req.body);
      const p = await store.get<Profile>('profile', input.patientId);
      if (!p) throw new Error('INVALID_INPUT');
      res.json(await store.mutate(s.id, input.requestId, input, async () => {
        await store.put('tag', input.tagUid, { patientId: p.id, revoked: false });
        await store.put('demo-name-display', input.tagUid, { patientId: p.id, deviceId: 'reader-pi-uno' });
        await store.receipt(p.id, s.id, 'RFID card linked to patient profile', [], clock(), { tagUid: input.tagUid });
        return { success: true, patientId: p.id, name: p.name, tagUid: input.tagUid };
      }));
    } catch (e) { next(e); }
  });

  router.post('/grants', async (req, res, next) => {
    try {
      const s = res.locals.staff as Staff, input = GrantRequestSchema.parse(req.body);
      if (!['paramedic', 'clinician'].includes(s.role)) return unavailable();
      res.json(await store.mutate(s.id, input.requestId, input, async () => {
        const link = await store.get<Linkage>('link', input.linkageId);
        if (!link || link.actor !== s.id || link.patient !== input.patientId || Date.parse(link.expiresAt) <= clock().getTime()) return unavailable();
        const p = await profile(input.patientId);
        if (p.release.revoked) throw new Error('GRANT_REVOKED');
        if (!p.release.allowedEntryIds.length && !input.identityVerified) throw new Error('NO_APPROVED_SCOPE');
        const g: Grant = { id: randomUUID(), actor: s.id, patient: p.id, deviceId: input.deviceId, releaseRevision: p.release.revision, expiresAt: new Date(clock().getTime() + 600000).toISOString(), purpose: input.purpose };
        await store.put('grant', g.id, g);
        await store.put('grant-session', g.id, { sessionHash: res.locals.tokenHash });
        if (link.rfid && s.reader === link.rfid.deviceId) {
          const scan = await store.get<Scan>('scan', link.rfid.eventId);
          const latest = await store.get<{ eventId: string }>('reader-scan', s.reader);
          const tag = scan && await store.get<{ patientId: string; revoked: boolean }>('tag', scan.tagUid);
          if (scan?.deviceId === s.reader && latest?.eventId === scan.eventId && tag?.patientId === p.id && !tag.revoked && Date.parse(scan.receivedAt) > clock().getTime() - 120000) {
            await store.put('reader-display', s.reader + ':' + scan.eventId, { grantId: g.id, expiresAt: new Date(clock().getTime() + 90000).toISOString() } satisfies ReaderDisplay);
          }
        }
        return g;
      }));
    } catch (e) { next(e); }
  });

  router.post('/cards', async (req, res, next) => {
    try {
      const s = res.locals.staff as Staff, input = z.object({ grantId: text }).strict().parse(req.body);
      const g = await grant(input.grantId, s.id, res.locals.tokenHash);
      res.json(await store.transaction(async () => project(g.patient, s.id, g.purpose, g.expiresAt)));
    } catch (e) { next(e); }
  });

  router.post('/dispatch', async (req, res, next) => {
    try {
      const s = res.locals.staff as Staff, input = DispatchRequestSchema.parse(req.body);
      if (s.role !== 'paramedic' || input.destination !== 'hospital-demo') return unavailable();
      // Grant is checked even for an idempotent retry.
      const g = await grant(input.grantId, s.id, res.locals.tokenHash);
      const result = await store.mutate(s.id, input.requestId, input, async () => {
        const alert: Alert = { id: randomUUID(), patientId: g.patient, destination: input.destination, unit: s.unit, etaMinutes: input.etaMinutes, timestamp: clock().toISOString(), status: 'EN_ROUTE', revision: 1, card: await project(g.patient, s.id, 'Dispatch: ' + g.purpose, g.expiresAt) };
        await store.put('alert', alert.id, alert);
        await store.put('alert-release', alert.id, { revision: g.releaseRevision });
        return { id: alert.id };
      });
      notify();
      res.json(result);
    } catch (e) { next(e); }
  });

  router.post('/alerts/read', async (_req, res, next) => {
    try {
      const s = res.locals.staff as Staff;
      if (s.facility !== 'hospital-demo' || s.role !== 'clinician') return unavailable();
      const result = await store.transaction(async () => {
        const alerts = (await store.all<Alert>('alert')).filter((a) => a.destination === s.facility);
        const out = [];
        for (const a of alerts) {
          const p = await profile(a.patientId);
          const scope = await store.get<{ revision: number }>('alert-release', a.id);
          if (!scope || scope.revision !== p.release.revision || p.release.revoked || Date.parse(a.card.expiresAt) <= clock().getTime()) {
            out.push({ id: a.id, status: a.status, unavailable: true });
          } else {
            out.push({ ...a, card: await project(p.id, s.id, 'Hospital dispatch review', a.card.expiresAt) });
          }
        }
        return out;
      });
      res.json(result);
    } catch (e) { next(e); }
  });

  router.post('/alerts/:id/status', async (req, res, next) => {
    try {
      const s = res.locals.staff as Staff, input = mutation.extend({ status: z.enum(['ARRIVED', 'RESOLVED']) }).strict().parse(req.body), id = String(req.params.id);
      const result = await store.mutate(s.id, input.requestId, { id, ...input }, async () => {
        const a = await store.get<Alert>('alert', id);
        if (!a || a.destination !== s.facility || s.role !== 'clinician') return unavailable();
        if (a.revision !== input.expectedRevision || !(a.status === 'EN_ROUTE' && input.status === 'ARRIVED' || a.status === 'ARRIVED' && input.status === 'RESOLVED')) throw new Error('CONFLICT');
        a.status = input.status;
        a.revision++;
        await store.put('alert', id, a);
        return { id, status: a.status, revision: a.revision };
      });
      notify();
      res.json(result);
    } catch (e) { next(e); }
  });

  router.post('/alerts/:id/acknowledge', async (req, res, next) => {
    try {
      const s = res.locals.staff as Staff, input = z.object({ requestId: text }).strict().parse(req.body), id = String(req.params.id);
      const result = await store.mutate(s.id, input.requestId, { id, ...input }, async () => {
        const a = await store.get<Alert>('alert', id);
        if (!a || a.destination !== s.facility || s.role !== 'clinician') return unavailable();
        if (!a.acknowledgedAt) {
          a.acknowledgedAt = clock().toISOString();
          a.acknowledgedBy = s.id;
          a.revision++;
          await store.put('alert', id, a);
        }
        return { id, acknowledgedAt: a.acknowledgedAt };
      });
      notify();
      res.json(result);
    } catch (e) { next(e); }
  });

  router.post('/alerts/:id/handoff', async (req, res, next) => {
    try {
      const s = res.locals.staff as Staff, input = z.object({ requestId: text }).strict().parse(req.body), id = String(req.params.id);
      const result = await store.mutate(s.id, input.requestId, { id, ...input }, async () => {
        const a = await store.get<Alert>('alert', id);
        if (!a || a.destination !== s.facility || s.role !== 'clinician') return unavailable();
        if (!a.handoffAt) {
          a.handoffAt = clock().toISOString();
          a.handoffBy = s.id;
          a.revision++;
          await store.put('alert', id, a);
        }
        return { id, handoffAt: a.handoffAt };
      });
      notify();
      res.json(result);
    } catch (e) { next(e); }
  });

  router.get('/events', (req, res) => {
    const s = res.locals.staff as Staff;
    if (!['hospital-demo', 'lab-demo'].includes(s.facility) && s.role !== 'paramedic') { res.status(403).end(); return; }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    // Notifications contain no patient data. Clients refetch via audited endpoints.
    const push = (event: 'refresh' | 'release-change' = 'refresh') => res.write(`event: ${event}\ndata: {}\n\n`);
    push();
    listeners.add(push);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);
    // Bounded stream; EventSource reconnects and re-authenticates.
    const expiry = setTimeout(() => res.end(), 300000);
    req.on('close', () => { listeners.delete(push); clearInterval(heartbeat); clearTimeout(expiry); });
  });

  router.post('/profiles/:id/book', async (req, res, next) => {
    try {
      const s = res.locals.staff as Staff, pid = String(req.params.id), input = z.object({ requestId: text, date: z.iso.date() }).strict().parse(req.body);
      if (!(await owner(s.id, pid))) return unavailable();
      res.json(await store.mutate(s.id, input.requestId, { pid, ...input }, async () => {
        const booking = { id: randomUUID(), patientId: pid, date: input.date, status: 'BOOKED', simulated: true, priceMinor: 4250, currency: 'USD' };
        await store.put('booking', booking.id, booking);
        return booking;
      }));
    } catch (e) { next(e); }
  });

  router.get('/ledger', async (_req, res, next) => {
    try {
      const s = res.locals.staff as Staff;
      if (s.facility !== 'lab-demo') return unavailable();
      res.json((await store.all<{ facility: string }>('ledger')).filter((l) => l.facility === s.facility));
    } catch (e) { next(e); }
  });

  router.post('/profiles/:id/snapshot', async (req, res, next) => {
    try {
      const s = res.locals.staff as Staff, pid = String(req.params.id), input = z.object({ deviceId: text }).strict().parse(req.body);
      if (!(await owner(s.id, pid))) return unavailable();
      res.json(await store.transaction(async () => {
        const expiresAt = new Date(clock().getTime() + 8 * 3600000).toISOString();
        const card = await project(pid, s.id, 'Prepare offline snapshot', expiresAt);
        const body = { id: randomUUID(), deviceId: input.deviceId, actorId: s.id, createdAt: clock().toISOString(), expiresAt, releaseRevision: (await profile(pid)).release.revision, card };
        const key = (await store.get<{ privateKey: string; publicKey: string }>('key', 'facility'))!;
        const snapshot = { ...body, signature: sign(null, Buffer.from(canonical(body)), key.privateKey).toString('base64'), publicKey: key.publicKey };
        await store.put('snapshot', body.id, { ...body, publicKey: key.publicKey });
        return snapshot;
      }));
    } catch (e) { next(e); }
  });

  router.post('/offline/receipts', async (req, res, next) => {
    try {
      const s = res.locals.staff as Staff, input = z.object({ snapshotId: text, deviceId: text, sequence: z.number().int().positive(), at: z.iso.datetime() }).strict().parse(req.body);
      const snap = await store.get<{ actorId: string; deviceId: string; card: { patientId: string } }>('snapshot', input.snapshotId);
      if (!snap || snap.actorId !== s.id || snap.deviceId !== input.deviceId) return unavailable();
      res.json(await store.mutate(s.id, 'offline:' + input.deviceId + ':' + input.sequence, input, async () => ({
        receiptId: await store.receipt(snap.card.patientId, s.id, 'Offline snapshot opened', [], clock(), { deviceReportedAt: input.at, snapshotId: input.snapshotId })
      })));
    } catch (e) { next(e); }
  });

  router.post('/readers/:id/revoke', async (req, res, next) => {
    try {
      const s = res.locals.staff as Staff;
      if (s.role !== 'admin') return unavailable();
      const reader = await store.get<Reader>('reader', String(req.params.id));
      if (!reader) return unavailable();
      reader.revoked = true;
      await store.put('reader', reader.id, reader);
      res.json({ revoked: true });
    } catch (e) { next(e); }
  });

  router.use((error: unknown, _req: unknown, res: import('express').Response, _next: unknown) => {
    const code = error instanceof z.ZodError ? 'INVALID_INPUT' : error instanceof Error ? error.message : 'INTERNAL_ERROR';
    const known = ['INVALID_INPUT', 'FORBIDDEN', 'CONFLICT', 'GRANT_EXPIRED', 'GRANT_REVOKED', 'SIGNATURE_INVALID'].includes(code);
    res.status(code === 'FORBIDDEN' ? 404 : code === 'INVALID_INPUT' ? 400 : known ? 409 : 503).json({ error: { code: known ? code : 'AUDIT_UNAVAILABLE', message: known ? code : 'Unable to commit request.', retryable: !known }, requestId: res.locals.requestId ?? randomUUID() });
  });
  return router;
}
