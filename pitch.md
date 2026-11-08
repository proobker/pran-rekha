# Pran Rekha

## A clearer health record when every minute matters

In an emergency, important health information can be hard to find. Pran Rekha gives patients one place to keep health records and choose what emergency teams can see. When a patient needs urgent care, paramedics can find the record, request temporary access, and send the approved summary to the hospital before arrival.

**Pran Rekha keeps the patient in control and makes every shared item traceable to its source.**

## How it works

1. **A hospital creates a patient account.** Staff enter a name, date of birth, and optional blood group, allergies, RFID tag, or consented face photo. The patient receives a login and a QR locator. Emergency sharing starts turned off.
2. **The patient builds and reviews their record.** They can view signed entries and where they came from, add a personal note, upload a document, and report whether they are taking a recorded medicine. Personal statements stay clearly separate from clinician-signed information.
3. **A lab adds a report.** Hospital staff can assign or remove a lab’s access to a patient. Lab staff can add a signed observation or scan a report or handwritten note. OCR runs on the device and creates a draft. The clinician checks each line against the original, confirms the patient using two identifiers, and signs the entries. The original image and raw OCR text remain linked to the signed record. Only an explicit diagnosis or impression may be suggested as a condition; unusual test values are not turned into diagnoses.
4. **The patient chooses what can be shared.** They select the entries included in an emergency summary and can change or revoke that permission at any time.
5. **Paramedics find the patient and request access.** They can use a paired RFID reader, a QR locator, or a manually entered locator. Before opening a record, they confirm two patient identifiers, state the emergency purpose, and request a short-lived grant. RFID and QR codes help locate a record; they do not prove identity. The paramedic portal’s face option is a labelled simulation. Real local face matching is available to hospital staff as a candidate aid and never opens a record.
6. **The hospital prepares for arrival.** The paramedic can send the approved summary and estimated arrival time to the demonstration hospital. Staff see the incoming case, acknowledge it, record a phone or radio handoff, and update the case as the patient arrives and care is handed over.

## What each person can do

### Patients

- View their health profile, signed entries, source details, and record review date.
- Choose the exact entries shared in an emergency, then update or revoke that sharing.
- Use a QR locator, add a clearly attributed personal note, and confirm text from an uploaded image or text PDF.
- Review medication history and add a statement about actual medicine use.
- Prepare an encrypted offline snapshot on their device, protect it with a passphrase, and unlock it when offline. Offline information may not include later changes or revocations.
- View access receipts and manage their optional face enrollment. Face data is removed after 30 days or can be deleted sooner.

### Paramedics

- Receive scans from an assigned RFID reader or enter a QR/manual locator.
- Confirm identity, record the emergency reason and trauma category, and open only the patient-approved summary under a temporary grant.
- See each item’s source and date, then send an ETA and approved summary to the hospital.
- Request a second clinician’s approval for exceptional access. That approval cannot add entries the patient did not approve or undo a revocation.

### Hospitals

- Register patients and accounts, assign RFID tags, and manage a lab’s access to assigned patients.
- View incoming authorized dispatches, acknowledge them, record a completed phone/radio handoff, and move cases through en route, arrived, and resolved.
- Add or update an optional face photo with consent, or use local face matching to suggest a possible patient. A match is only a suggestion.
- Review and sign handwritten-note candidates for patients they registered, and approve eligible second-clinician requests.

### Labs

- View only patients assigned to the lab and switch among those patients.
- Add signed observations, test results, or medication records with their source.
- Scan a printed report or handwritten note. English OCR runs locally; Nepali-script text must be transcribed by a person. Lab staff review every selected line before signing.
- Append medication history events such as started, held, resumed, stopped, completed, dose changed, corrected, or retracted. A prescription is evidence of an instruction, not proof the patient is taking it.
- View signed record versions and a clearly labelled simulated revenue ledger. The demo ledger does not process payments.

## Built for careful sharing

- **Source-linked records:** Entries keep their author, date, and source so people can check where information came from.
- **Patient-controlled sharing:** Emergency views include only the current approved scope. Changes and revocations clear or block older access.
- **Temporary, audited access:** Emergency access is tied to a person, session, patient, purpose, expiry, and release version. Reads create an access receipt.
- **Signed record history:** Clinician-reviewed versions carry a tamper-evident demo signature, and the app checks integrity when records are read.
- **Safer retries:** Requests can be repeated after a weak connection without creating duplicate records or dispatches.
- **Phone and hardware support:** The app can be installed as a PWA. Supported RFID readers include an ESP32 reader and an Arduino/Raspberry Pi reader with a small LCD. The LCD shows only approved information and clears it after a short time.
- **Reader administration:** An administrator can provision or revoke readers and manage the card-to-patient links used by the demo.
- **English and Nepali interface:** The interface includes both languages, with Nepali wording still awaiting native-speaker review. The app also supports light and dark themes.

## A demonstration, not a clinical system

Pran Rekha is a hackathon prototype using synthetic patient data. It does not diagnose, recommend treatment, prove that records are current, or replace normal clinical checks. OCR and face matching can be wrong, so staff must review suggestions. The report OCR currently reads English text; Nepali-script text needs manual transcription. The hospital handoff records staff actions but does not place calls or send a production alert. The simulated business ledger does not take payment.

**The goal is simple: help the right care team find the right patient-approved information, while keeping its source and access history visible.**
