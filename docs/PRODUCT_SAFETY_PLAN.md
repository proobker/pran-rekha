# Product safety and pilot readiness

Pran Rekha is a synthetic demonstration. The changes in this repository improve the demo workflow; they do not make it a clinical record system or authorize clinical use.

## Implemented in the demo

- A paramedic must attest to checking two identifiers with the patient, wristband, or authorized caregiver before the API grants access. RFID, QR, and face matching remain locators/candidate aids, not proof of identity.
- Emergency cards show each item's recorded date and source and ask staff to verify currentness. A profile review schedule is not evidence that each item is current.
- Patient release changes notify connected paramedic sessions, which clear the currently displayed card. Every API read also checks the latest release revision.
- Second-clinician approval is limited to entries already approved by the patient. It cannot expand scope or bypass revocation. Empty scopes cannot be requested.
- Face enrollment is restricted to assigned patients, the patient can delete their own enrollment, and the demo deletes face photos/templates after 30 days. This is a demo retention setting, not a production retention policy.
- The hospital board records acknowledgement and a completed phone/radio handoff. These are records of staff actions; they do not deliver a push notification or place a call.
- The patient-facing emergency screen no longer promotes paid checkups. The lab's simulated commission ledger is separated behind a business-model disclosure.

## Required before any real-world pilot

| Area | Decision or work required | Acceptance evidence |
| --- | --- | --- |
| Clinical governance | Name a clinical safety owner; define intended users, intended use, prohibited use, escalation rules, hazard review, and incident response. | Signed safety case and approved operating procedures. |
| Identity and access | Validate the two-identifier procedure, staff roles, assignment model, break-glass policy, audit review, and access termination with participating facilities. | Approved access matrix and witnessed workflow tests. |
| Data freshness | Define field-specific review/expiry rules, provenance requirements, correction workflows, and what happens when sources conflict. | Clinically approved data dictionary and reconciliation procedure. |
| Interoperability | Map the minimum emergency dataset to the HL7 International Patient Summary (IPS), including provenance, author, timestamps, allergies, medications, and problem status; validate profiles and exchange with each partner EHR. | Conformance results and partner-system integration tests. |
| Alerts and downtime | Connect to a monitored notification service with delivery receipts, acknowledgement deadlines, retries, escalation ownership, and a tested phone/radio fallback. The current SSE board is not a reliable alerting channel. | End-to-end delivery and outage drills with measured acknowledgement times. |
| Privacy and security | Complete a data-protection impact assessment, consent/withdrawal process, encryption/key management, access logging, breach response, and jurisdiction-specific retention/deletion schedule. | Approved assessment, threat model, and deletion verification. |
| Offline access | Set the minimum offline dataset, device-management requirements, key recovery, maximum offline lifetime, revocation behavior, and safe destruction process. | Approved offline policy and lost-device exercise. |
| Localization and accessibility | Have Nepali clinical terminology reviewed by qualified native speakers; validate assistive-technology use, low-connectivity behavior, and literacy needs with intended users. | Signed language review and accessibility/usability findings. |
| Incentives and sustainability | Approve a transparent business model and conflict-of-interest controls that keep referral or commission incentives out of clinical decisions. | Published policy and audited payment/commission boundaries. |
| Pilot evaluation | Define safety, equity, usability, reliability, and resource-use measures; compare with current workflows and establish stop criteria. | Approved evaluation protocol and go/no-go review. |

The HL7 IPS is a useful exchange target for a concise patient summary, but adopting its data model does not itself provide interoperability: each partner interface, terminology mapping, consent rule, and operational workflow still needs validation. See the [HL7 IPS implementation guide](https://hl7.org/fhir/uv/ips/en/index.html). Digital health should be evaluated for benefits, harms, acceptability, feasibility, resource use, and equity alongside the functioning health service it supports; see the [WHO digital health guideline](https://www.who.int/publications/i/item/9789241550505).
