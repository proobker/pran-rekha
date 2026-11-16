'use client';
import { useState } from 'react';
import { CreditCard, CheckCircle2, RefreshCw } from 'lucide-react';
import { api, requestId } from './client';
import { Localized } from './Localized';

export function LinkCard({
  patients,
  onLinked
}: {
  patients: { id: string; name: string }[];
  onLinked?: () => void;
}) {
  const [patientId, setPatientId] = useState('PR-9042-8819');
  const [tagUid, setTagUid] = useState('');
  const [busy, setBusy] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<string | null>(null);
  const [detected, setDetected] = useState<{ tagUid: string; secondsAgo: number; name?: string | undefined } | null>(null);

  async function checkLatestScan() {
    setPolling(true);
    setError('');
    try {
      const res = await api<{
        state: string;
        tagUid?: string;
        secondsAgo?: number;
        linkedPatient?: { id: string; name: string };
      }>('platform/rfid/latest');
      if (res.state === 'FOUND' && res.tagUid) {
        setTagUid(res.tagUid);
        setDetected({
          tagUid: res.tagUid,
          secondsAgo: res.secondsAgo ?? 0,
          name: res.linkedPatient?.name
        });
      } else {
        setError('No recent card tap detected in the last 5 minutes. Tap your card on the hardware scanner and click this again.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to query scanner');
    } finally {
      setPolling(false);
    }
  }

  async function linkCard(e: React.FormEvent) {
    e.preventDefault();
    if (!tagUid.trim()) return;
    setBusy(true);
    setError('');
    setSuccess(null);
    try {
      const res = await api<{ success: boolean; name: string; tagUid: string; patientId: string }>(
        'platform/rfid/bind',
        {
          requestId: requestId(),
          patientId,
          tagUid: tagUid.trim().toUpperCase()
        }
      );
      setSuccess(`Card ${res.tagUid} is now linked to ${res.name} (${res.patientId})!`);
      setDetected(null);
      onLinked?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Linking card failed');
    } finally {
      setBusy(false);
    }
  }

  const patientOptions = [...patients];
  if (!patientOptions.some(p => p.id === 'PR-9042-8819')) {
    patientOptions.unshift({ id: 'PR-9042-8819', name: 'Siddharth Raj Sharma' });
  }

  return (
    <Localized>
      <section className="surface wide link-card-tool">
        <h2><CreditCard /> Link RFID Card to Patient</h2>
        <p>
          Tap a physical card on the hardware scanner, then bind it to any patient record (such as Siddharth).
          Once bound, the hardware reader LCD will recognize the card and display the patient&apos;s name on tap.
        </p>

        <form onSubmit={linkCard} className="tool-form" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
          <label>
            Target Patient
            <select
              value={patientId}
              onChange={e => setPatientId(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
            >
              {patientOptions.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.id})
                </option>
              ))}
            </select>
          </label>

          <div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
              <label style={{ flex: 1 }}>
                RFID Tag UID
                <input
                  value={tagUid}
                  onChange={e => setTagUid(e.target.value.toUpperCase())}
                  placeholder="e.g. 53A8129C (8, 14 or 20 hex digits)"
                  style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
                />
              </label>
              <button
                type="button"
                onClick={checkLatestScan}
                disabled={polling}
                style={{ height: '42px', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <RefreshCw size={14} className={polling ? 'spin' : ''} />
                {polling ? 'Reading…' : 'Read from Scanner'}
              </button>
            </div>
            {detected && (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-primary, #059669)', marginTop: '0.25rem' }}>
                ✓ Detected card <strong>{detected.tagUid}</strong> (tapped {detected.secondsAgo}s ago)
                {detected.name ? ` · currently linked to ${detected.name}` : ' · unassigned card'}
              </p>
            )}
          </div>

          <button
            type="submit"
            className="primary"
            disabled={busy || !tagUid.trim()}
            style={{ alignSelf: 'flex-start' }}
          >
            {busy ? 'Linking…' : 'Link Card to Patient'}
          </button>
        </form>

        {error && <p role="alert" className="notice error" style={{ marginTop: '0.75rem' }}>{error}</p>}
        {success && (
          <p role="status" className="notice" style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle2 size={16} color="#16a34a" /> {success}
          </p>
        )}
      </section>
    </Localized>
  );
}
