# Nepal lab report ingestion: research notes

## What the public sources show

- Nepal does not have one universal patient-facing report layout represented by the sources reviewed here. The National Public Health Laboratory (NPHL) publishes an online report entry point, says patients can access reports through the QR code on the bill, and lists a broad catalogue including CBC, fasting glucose, liver and renal function, lipid profile, thyroid tests, urine R/E, and many specialized tests. Treat this as evidence of a common access pattern and test vocabulary, not a national report schema. [NPHL patient portal](https://www.nphl.gov.np/patient-portal), [NPHL FAQ](https://www.nphl.gov.np/faq)
- A Nepal government HMIS 6.2 Laboratory Request and Reporting Form has a disease-program-specific layout for TB testing. It includes patient name, age, sex, address, contact, treatment history, retrovirus status, specimen type, requested test, collection date, lab number, microscopy result and grading, and examiner name/NHPC number/signature/date. Its grading and result structure (for example, scanty and 1+/2+/3+) is not interchangeable with a numeric chemistry result. [HMIS 6.2 form hosted by a government health office](https://hsodailekh.gov.np/wp-content/uploads/2023/01/HMIS-6.2-Laboratory-Request-Report-Form.pdf)
- The 2025 national sample collection and transportation guideline gives a minimum request-form dataset for public-health event testing: collection date, sample ID, patient name, age in months/years, gender (M/F/O), residence, symptom-onset date, symptoms, suspected clinical classification, and additional information. It separately says samples should be labelled with patient name, unique ID, requested test, and collection date/time. These are useful provenance and matching fields, but the guideline is scoped to acute public-health events, not every routine lab report. [National guideline (2025), especially pp. 21–23](https://edcd.gov.np/resources/download/national-guideline-for-sample-collection-and-transportation-during-acute-public-health-events-2025)
- NPHL describes itself as Nepal's reference laboratory and a quality-assurance/regulatory body for laboratory registration and licensing. Its page links a registry of registered laboratories. For uploads, the source laboratory and its identity therefore matter; a file image alone should not be treated as verified provenance. [Department of Health Services: NPHL](https://dohs.gov.np/posts/single/national-public-health-laboratory-nphl), [NPHL registered-laboratory list](https://www.nphl.gov.np/page?id=19&title=registered-laboratory)
- A government-operated APF Hospital report portal asks for both MRN and mobile number before report access. This is one example of a local access-control flow, not proof of a countrywide identity standard. [Nepal APF Hospital lab report portal](https://labreport.apf.gov.np/)

## Product implications for this app

### Upload and extraction

1. Accept the original PDF or image and keep it unchanged. Store upload time, uploader/lab account, claimed source laboratory, report/sample/accession number, patient identifier(s), specimen, collection time, report time, and whether the document is original, corrected, or supersedes another report. Keep an audit trail for replacement and deletion.
2. OCR should produce a **draft transcription**. Keep the source image/PDF beside every extracted field so a lab operator can compare it. Capture, where present: test name as printed, result, unit, the report's own reference interval, printed abnormal/critical flag, method, specimen, and report status. Preserve qualitative, graded, and narrative results; do not force them into numeric values.
3. Support English and Nepali/Devanagari text, Nepali and Gregorian date representations, common abbreviations, and low-quality scans. Never silently normalize an uncertain test name, value, unit, decimal, sign, date, or patient identifier. Show confidence/uncertainty and require manual correction before publishing. These are implementation recommendations based on the source variation above, not a claim that a single national format mandates those fields.
4. Store the laboratory's own reference interval and flag, including age/sex-specific intervals if printed. Do not apply a generic “normal range” across labs, methods, ages, or units. If the report has no range, say “not provided” rather than inventing one.

### What the “scan for conditions” feature may say

- OCR and rules may surface **candidate findings** such as “the report marks this value high” or “this text mentions a possible finding.” Present the exact report text/value, unit, reference interval, source, and date.
- Do not diagnose a condition, infer a disease from one or more values, recommend treatment, or imply that a negative/normal result rules out disease. Abnormality is not itself a diagnosis, and a condition cannot reliably be inferred from report text alone.
- Require a qualified clinician to review and explicitly accept, edit, or dismiss each candidate before it becomes a patient condition/problem. Keep “machine-extracted,” “lab-verified,” and “clinician-confirmed” as distinct states and attribute each action to a named account and timestamp.
- A critical result needs a laboratory-defined escalation process with acknowledgment and phone/radio fallback. OCR alone must never decide that a value is safe or trigger an unreviewed clinical action.

### Lab-to-patient linking and “change user”

Treat reassignment as a correction to a report's patient link, not as a way to edit a patient account or silently move all of a person's history. Before publishing a report, require matching at least two identifiers against the lab source record and the patient's record; the report portal, QR code, or OCR result is only a locator. If correcting a link, require an authorized lab user, record the previous and new patient link, reason, actor, time, and affected report IDs, notify/review through the established workflow, and preserve rollback/audit history. Keep an unlinked report quarantined until resolved. These are product safety recommendations; the sources reviewed do not define a general national patient-account reassignment workflow.

## Limits and validation needed

The sources reviewed are official Nepal public-sector examples and guidance, but they do not establish a universal routine-report template or a validated Nepali OCR vocabulary. Before a pilot, obtain consented/de-identified sample reports from each participating lab, have lab professionals validate extraction and terminology, and have clinicians validate the display and review workflow. Validate both Nepali and English documents, mixed scripts, handwriting, stamps, reference ranges, amendments, and all result types. Keep the feature assistive until that evaluation and governance are complete.

## References

- [NPHL patient portal and test catalogue](https://www.nphl.gov.np/patient-portal)
- [NPHL FAQ: accessing reports and package test names](https://www.nphl.gov.np/faq)
- [HMIS 6.2 Laboratory Request and Reporting Form](https://hsodailekh.gov.np/wp-content/uploads/2023/01/HMIS-6.2-Laboratory-Request-Report-Form.pdf)
- [National Guideline for Sample Collection and Transportation during Acute Public Health Events (2025)](https://edcd.gov.np/resources/download/national-guideline-for-sample-collection-and-transportation-during-acute-public-health-events-2025)
- [Department of Health Services: National Public Health Laboratory](https://dohs.gov.np/posts/single/national-public-health-laboratory-nphl)
- [NPHL registered laboratories](https://www.nphl.gov.np/page?id=19&title=registered-laboratory)
- [Nepal APF Hospital lab-report portal](https://labreport.apf.gov.np/)
