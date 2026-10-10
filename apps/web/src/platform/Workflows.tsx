'use client';
import { useEffect, useState } from 'react';
import type { MedicationRecord, PrescriptionView } from '@pran-rekha/contracts';
import type { Card } from '@pran-rekha/contracts/platform';
import { api, requestId } from './client';
import { Localized } from './Localized';
type Doc={id:string;title:string;pages:string[];status:string};
type Med={record:MedicationRecord;view:PrescriptionView;events:{id:string;kind:string;effectiveDate:string;source:string}[];useReports:{id:string;statement:string;actorId:string;reportedAt:string;lastDose:string|null}[]};
export function RecordWorkflows({patientId,revision,onChange,clinician=false}:{patientId:string;revision:number;onChange:()=>Promise<void>;clinician?:boolean}){
  const [docs,setDocs]=useState<Doc[]>([]),[meds,setMeds]=useState<Med[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [documentId,setDocumentId]=useState(''),[page,setPage]=useState(1),[start,setStart]=useState(0),[end,setEnd]=useState(1),[value,setValue]=useState('');
  const [drug,setDrug]=useState(''),[dose,setDose]=useState(''),[frequency,setFrequency]=useState(''),[evidence,setEvidence]=useState('');
  const [effective,setEffective]=useState(new Date().toISOString().slice(0,10)),[eventKind,setEventKind]=useState('status_confirmed'),[target,setTarget]=useState(''),[replacement,setReplacement]=useState('');
  async function refresh(){setMeds(await api('platform/profiles/'+patientId+'/medications'));if(!clinician)setDocs(await api('platform/profiles/'+patientId+'/documents'));}
  useEffect(()=>{void refresh().catch(e=>setError(String(e)));},[patientId,revision,clinician]);
  async function run(action:()=>Promise<void>){setBusy(true);setError('');try{await action();await refresh();await onChange();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  const doc=docs.find(d=>d.id===documentId);
  return <Localized><section className="surface wide">
    <h2>Documents and medication history</h2>{error&&<p role="alert" className="error">{error}</p>}
    {!clinician&&<>
      <label>Import JPEG, PNG or text PDF (10 MiB maximum)<input type="file" accept="image/jpeg,image/png,application/pdf" disabled={busy} onChange={e=>{
        const file=e.target.files?.[0];if(!file)return;
        void run(async()=>{if(file.size>10*1024*1024)throw new Error('File exceeds 10 MiB.');
          const base64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]!);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});
          await api('platform/profiles/'+patientId+'/documents',{requestId:requestId(),title:file.name,base64});
        });
      }}/></label>
      <label>Source document<select value={documentId} onChange={e=>{setDocumentId(e.target.value);setPage(1);}}><option value="">Select source</option>{docs.map(d=><option value={d.id} key={d.id}>{d.title} · {d.status}</option>)}</select></label>
      {doc&&<><a href={'/api/platform/documents/'+doc.id+'/original'} download>Download private original</a>
        <label>Page<input type="number" min={1} max={doc.pages.length} value={page} onChange={e=>setPage(Number(e.target.value))}/></label>
        <pre style={{whiteSpace:'pre-wrap',maxHeight:180,overflow:'auto'}}>{doc.pages[page-1]||'No extracted text. Enter an attributed manual transcription below.'}</pre>
        {doc.pages[page-1]&&<><label>Source start (UTF-16 offset)<input type="number" min={0} value={start} onChange={e=>setStart(Number(e.target.value))}/></label><label>Source end<input type="number" min={1} value={end} onChange={e=>setEnd(Number(e.target.value))}/></label><blockquote>{doc.pages[page-1]!.slice(start,end)}</blockquote></>}
        <label>Confirmed value<textarea value={value} onChange={e=>setValue(e.target.value)}/></label>
        <button disabled={busy||!value} onClick={()=>void run(async()=>{await api('platform/documents/'+doc.id+'/confirm',{requestId:requestId(),expectedRevision:revision,page,start,end,text:value,date:effective,kind:'report'});setValue('');})}>Confirm source and patient</button>
      </>}
    </>}
    <label>Effective clinical date<input type="date" value={effective} onChange={e=>setEffective(e.target.value)}/></label>
    <label>Attributed statement / source evidence<textarea value={evidence} onChange={e=>setEvidence(e.target.value)}/></label>
    {clinician&&<><h3>Add immutable prescription</h3><label>Drug as written<input value={drug} onChange={e=>setDrug(e.target.value)}/></label><label>Dose as written<input value={dose} onChange={e=>setDose(e.target.value)}/></label><label>Frequency as written<input value={frequency} onChange={e=>setFrequency(e.target.value)}/></label>
      <button disabled={busy||!drug||!dose||!frequency||!evidence} onClick={()=>void run(async()=>{await api('platform/profiles/'+patientId+'/medications',{requestId:requestId(),drugText:drug,doseText:dose,frequencyText:frequency,source:evidence,startDate:effective,endDate:null});})}>Save prescription evidence</button>
      <label>Event kind<select value={eventKind} onChange={e=>setEventKind(e.target.value)}>{['started','status_confirmed','held','resumed','stopped','completed','dose_changed','substituted','corrected','retracted'].map(k=><option key={k}>{k}</option>)}</select></label>
      <label>Target event ID (correction/retraction)<input value={target} onChange={e=>setTarget(e.target.value)}/></label>
      <label>Replacement event/record ID<input value={replacement} onChange={e=>setReplacement(e.target.value)}/></label>
    </>}
    <div className="entries">{meds.map(m=><article className="entry" key={m.record.id}><span className="pill">{m.view.state}</span><h3>{m.record.drug.rawText}</h3><p>{m.record.doseText} · {m.record.frequencyText}</p><p>{m.view.basis}</p><small>Record: {m.record.id}</small>
      {m.events.map(e=><p key={e.id}>{e.kind} · {e.effectiveDate} · {e.source}<br/><small>{e.id}</small></p>)}
      {m.useReports.map(r=><p key={r.id}>Reported by {r.actorId} at {r.reportedAt}: {r.statement} · last dose {r.lastDose??'unknown'}</p>)}
      {clinician?<button disabled={busy||!evidence} onClick={()=>void run(async()=>{await api('platform/medications/'+m.record.id+'/events',{requestId:requestId(),expectedRevision:m.view.sourceRevision,kind:eventKind,effectiveDate:effective,source:evidence,...(eventKind==='status_confirmed'?{status:'documented_active'}:{}),...(['corrected','retracted'].includes(eventKind)?{targetEventId:target}:{}),...(eventKind==='corrected'?{replacementEventId:replacement}:{}),...(['substituted','dose_changed'].includes(eventKind)?{replacementRecordId:replacement}:{})});})}>Append event</button>
      :<button disabled={busy||!evidence} onClick={()=>void run(async()=>{await api('platform/medications/'+m.record.id+'/use-reports',{requestId:requestId(),use:'uncertain',lastDose:null,statement:evidence});})}>Add attributed use report</button>}
    </article>)}</div>
  </section></Localized>;
}
export function BreakGlass({hospital=false,link,purpose,identityVerified=false}:{hospital?:boolean;link?:{patientId:string;linkageId:string}|null;purpose?:string;identityVerified?:boolean}){
  const [requests,setRequests]=useState<{id:string;patient:string;approvedEntryCount:number;purpose:string;status:string}[]>([]),[id,setId]=useState(''),[message,setMessage]=useState('');
  const [card,setCard]=useState<Card|null>(null);
  async function run(action:()=>Promise<unknown>){try{setMessage(JSON.stringify(await action()));}catch(e){setMessage(String(e));}}
  return <Localized><section className="surface"><h2>Second-clinician approval</h2><p>Requests access to entries the patient already approved. It cannot expand scope or bypass revocation; verify two identifiers first.</p>
    {hospital?<><button onClick={()=>void run(async()=>{const rows=await api<typeof requests>('platform/break-glass');setRequests(rows);return {pending:rows.length};})}>Load approval queue</button>{requests.map(r=><p key={r.id}>Patient {r.patient} · {r.approvedEntryCount} entries · {r.purpose}<button onClick={()=>void run(()=>api('platform/break-glass/'+r.id+'/approve',{requestId:requestId()}))}>Approve five-minute access</button></p>)}</>
    :<><button disabled={!link||!identityVerified} onClick={()=>void run(async()=>{const result=await api<{id:string}>('platform/break-glass',{requestId:requestId(),...link,purpose:purpose??'Emergency review request',deviceId:'staff-browser',confirmed:true,identityVerified:true});setId(result.id);return result;})}>Request independent approval</button>{id&&<button onClick={()=>void run(async()=>{const result=await api<{status:string;grantId?:string}>('platform/break-glass/'+id);if(result.grantId)setCard(await api<Card>('platform/cards',{grantId:result.grantId}));return result;})}>Check approval</button>}{card&&<><p>{card.notice}</p>{card.entries.map(entry=><article className="entry" key={entry.id}><strong>{entry.kind}: {entry.text}</strong><p>{entry.date} · {entry.source}</p></article>)}</>}</>}
    <p role="status">{message}</p>
  </section></Localized>;
}

export function LabAccess({patients}:{patients:{id:string;name:string}[]}){
  const [patientId,setPatientId]=useState(patients[0]?.id??''),[assigned,setAssigned]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{if(!patients.some(p=>p.id===patientId))setPatientId(patients[0]?.id??'');},[patients,patientId]);
  useEffect(()=>{if(!patientId){setAssigned(false);return;}void api<{assigned:boolean}>('platform/profiles/'+patientId+'/lab-access').then(r=>setAssigned(r.assigned)).catch(e=>setError(String(e)));},[patientId]);
  async function toggle(){setBusy(true);setError('');try{const result=await api<{assigned:boolean}>('platform/profiles/'+patientId+'/lab-access',{requestId:requestId(),active:!assigned});setAssigned(result.assigned);}catch(e){setError(String(e));}finally{setBusy(false);}}
  return <Localized><section className="surface"><h2>Laboratory access</h2>{!patients.length?<p>No patients are assigned to this hospital account.</p>:<><label>Patient<select value={patientId} onChange={e=>setPatientId(e.target.value)}>{patients.map(p=><option key={p.id} value={p.id}>{p.name} · {p.id}</option>)}</select></label><p>{assigned?'The demo laboratory can review and update this patient.':'The demo laboratory cannot access this patient.'}</p><button disabled={busy||!patientId} onClick={()=>void toggle()}>{assigned?'Remove lab access':'Assign to lab'}</button></>}{error&&<p role="alert" className="error">{error}</p>}</section></Localized>;
}
