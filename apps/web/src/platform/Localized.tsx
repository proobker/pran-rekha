'use client';

import { cloneElement, isValidElement, type ReactNode } from 'react';
import { usePreferences } from './client';

// UI copy is keyed by its English source so the domain values and API payloads
// remain unchanged when the interface language changes.
const ne: Record<string, string> = {
  'Patient':'बिरामी','Paramedic':'प्यारामेडिक','Hospital':'अस्पताल','Lab':'प्रयोगशाला',
  'Sign in':'साइन इन गर्नुहोस्','Sign out':'साइन आउट गर्नुहोस्','Health records':'स्वास्थ्य अभिलेख','Source':'स्रोत',
  'Emergency release':'आपत्कालीन पहुँच','Save release':'पहुँच सुरक्षित गर्नुहोस्','Revoke release':'पहुँच रद्द गर्नुहोस्','Access receipts':'पहुँच विवरण',
  'Sign clinical record':'चिकित्सकीय अभिलेखमा हस्ताक्षर गर्नुहोस्','Initiate pre-arrival dispatch':'आगमनअघि सूचना पठाउनुहोस्','Read paired RFID scanner':'जडित RFID स्क्यानर पढ्नुहोस्',
  'Resolve locator':'परिचायकबाट खोज्नुहोस्','Prepare offline copy':'अफलाइन प्रति तयार गर्नुहोस्','Book review appointment':'पुनरावलोकनको समय लिनुहोस्',
  'Add patient report':'बिरामीको विवरण थप्नुहोस्','Review due':'पुनरावलोकन गर्नुपर्ने','Synthetic demonstration':'नमुना प्रदर्शन','Refresh':'ताजा गर्नुहोस्',
  'I have confirmed patient linkage':'मैले बिरामीको पहिचान पुष्टि गरेको छु','Access reason':'पहुँचको कारण','Username':'प्रयोगकर्ता नाम','Password':'पासवर्ड',
  'Dark':'गाढा','Light':'उज्यालो','Switch to dark mode':'गाढा मोडमा बदल्नुहोस्','Switch to light mode':'उज्यालो मोडमा बदल्नुहोस्',
  'English':'अङ्ग्रेजी','Demo accounts: siddharth, paramedic, hospital and lab. Password: pran-demo- followed by username.':'डेमो खाताहरू: siddharth, paramedic, hospital र lab। पासवर्ड: pran-demo- पछि प्रयोगकर्ता नाम।',
  'This account has no access to this portal.':'यो खातालाई यस पोर्टलमा पहुँच छैन।','Sign out and authenticate with the provisioned account for this role.':'साइन आउट गरी यो भूमिकाका लागि तोकिएको खाताबाट प्रवेश गर्नुहोस्।',
  'Your emergency pass':'तपाईंको आपत्कालीन परिचयपत्र','Historical recorded blood group · verification required':'अभिलेखमा रहेको पुरानो रक्त समूह · पुष्टि आवश्यक',
  'FICTIONAL DEMO: date of birth and medical details are generated samples, not verified medical history.':'काल्पनिक डेमो: जन्ममिति र स्वास्थ्य विवरण नमुना हुन्, पुष्टि गरिएको स्वास्थ्य इतिहास होइन।',
  'Date of birth:':'जन्ममिति:','Opaque emergency locator QR':'आपत्कालीन परिचायक QR कोड','Review overdue':'पुनरावलोकन म्याद नाघेको',
  'Review schedule; current health and medication use require separate assessment.':'पुनरावलोकन तालिका; हालको स्वास्थ्य र औषधि प्रयोगको छुट्टै मूल्याङ्कन आवश्यक छ।',
  '$50 checkup · 15% Pran Rekha partner discount → $42.50 (simulated)':'जाँच $५० · प्रण रेखा साझेदारको १५% छुटपछि → $४२.५० (नमुना)',
  'Simulated appointment booked for $42.50. No payment was taken.':'$४२.५० को नमुना भेटघाट तय भयो। कुनै भुक्तानी लिइएन।',
  'Select each entry and its excerpt for emergency sharing.':'आपत्कालीन अवस्थामा साझा गर्न प्रत्येक विवरण र त्यसको अंश छान्नुहोस्।',
  'Emergency release updated.':'आपत्कालीन पहुँच अद्यावधिक भयो।','Add a personal note':'व्यक्तिगत टिप्पणी थप्नुहोस्','Your note':'तपाईंको टिप्पणी',
  'Attributed to you; this does not change a clinician-signed record.':'यो विवरण तपाईंको नाममा रहनेछ; यसले चिकित्सकले हस्ताक्षर गरेको अभिलेख परिवर्तन गर्दैन।',
  'No access receipts yet.':'अहिलेसम्म पहुँच विवरण छैन。','Signed in ·':'प्रवेश गरिएको ·','Record type':'अभिलेखको प्रकार',
  'Verbatim observation, result or medication':'जस्ताको तस्तै अवलोकन, नतिजा वा औषधि','Signed version committed. Patient approval is required for emergency sharing.':'हस्ताक्षर गरिएको संस्करण सुरक्षित भयो। आपत्कालीन रूपमा साझा गर्न बिरामीको स्वीकृति आवश्यक छ।',
  'Sign & commit to Pran Rekha':'प्रण रेखामा हस्ताक्षर गरी सुरक्षित गर्नुहोस्','Ed25519 demo signature · integrity verified on every read. Demonstrates record integrity, not accreditation.':'Ed25519 नमुना हस्ताक्षर · प्रत्येक पटक पढ्दा अखण्डता जाँच हुन्छ। यसले अभिलेखको अखण्डता देखाउँछ, मान्यता होइन।',
  'Simulated revenue ledger':'नमुना आम्दानी विवरण','No checkups signed yet.':'अहिलेसम्म कुनै जाँच हस्ताक्षर गरिएको छैन।','Total commission:':'कुल कमिसन:',
  'Illustrative only. No payments are processed.':'जानकारीका लागि मात्र। कुनै भुक्तानी प्रक्रिया हुँदैन।','Record history and entries':'अभिलेखको इतिहास र विवरण',
  'Medication and document tools':'औषधि तथा कागजातका उपकरण','Review or add source evidence':'स्रोत प्रमाण हेर्नुहोस् वा थप्नुहोस्','Import documents or review medication history':'कागजात आयात गर्नुहोस् वा औषधिको इतिहास हेर्नुहोस्',
  'RFID scanner':'RFID स्क्यानर','Paired reader:':'जडित रिडर:','Card found. Confirm access below to show the summary on the scanner LCD.':'कार्ड भेटियो। स्क्यानरको पर्दामा सारांश देखाउन तल पहुँच पुष्टि गर्नुहोस्।',
  'Other ways to find a record':'अभिलेख खोज्ने अन्य तरिका','Simulate QR scan':'QR स्क्यानको नमुना','QR / manual locator':'QR / परिचायक कोड','Consent to session-only face candidate simulation':'यो सत्रमा मात्र अनुहारको नमुना मिलान गर्न सहमति दिनुहोस्',
  'Simulate face candidate':'अनुहारको नमुना मिलान गर्नुहोस्','SIMULATED possible local candidate. Record remains locked. No image captured.':'नमुना सम्भावित मिलान। अभिलेख बन्द नै छ। कुनै तस्बिर खिचिएको छैन।',
  'Pre-arrival access':'आगमनअघिको पहुँच','Awaiting locator':'परिचायकको प्रतीक्षामा','Trauma category':'चोटपटकको वर्ग','Open approved emergency summary':'स्वीकृत आपत्कालीन सारांश खोल्नुहोस्',
  'Destination: Pran Rekha Demonstration Hospital':'गन्तव्य: प्रण रेखा नमुना अस्पताल','Initiate pre-arrival ER stream':'आगमनअघि आपत्कालीन सूचना पठाउनुहोस्',
  'Dispatch committed. The destination hospital can now read its approved scope.':'सूचना पठाइयो। गन्तव्य अस्पतालले अब स्वीकृत विवरण हेर्न सक्छ।',
  'Incoming patients':'आगमन गर्ने बिरामी','Sound on':'ध्वनि चालु','Sound off':'ध्वनि बन्द','No active authorized dispatches.':'कुनै सक्रिय स्वीकृत सूचना छैन।',
  'Approved summary':'स्वीकृत सारांश','Mark arrived':'आइपुगेको चिनो लगाउनुहोस्','Resolve':'समाधान गर्नुहोस्','Patient and document tools':'बिरामी तथा कागजातका उपकरण',
  'Registration · records · face lookup':'दर्ता · अभिलेख · अनुहार खोज','Prepared offline viewer':'अफलाइन दर्शक तयार गर्नुहोस्','Unlock or prepare this device':'यो उपकरण खोल्नुहोस् वा तयार गर्नुहोस्',
  'Unlock phrase (12+ characters)':'खोल्ने वाक्यांश (कम्तीमा १२ अक्षर)','Encrypted snapshot prepared on this browser.':'यस ब्राउजरमा गुप्तिकृत प्रतिलिपि तयार भयो।',
  'Unlock saved snapshot':'सुरक्षित प्रतिलिपि खोल्नुहोस्','Break-glass review':'आपत्कालीन विशेष पहुँच समीक्षा','Break-glass request':'आपत्कालीन विशेष पहुँच अनुरोध',
  'Independent emergency access':'स्वतन्त्र आपत्कालीन पहुँच','Close':'बन्द गर्नुहोस्','Nepali copy pending native-speaker review · BS conversion unavailable pending verified reference pairs':'नेपाली अनुवादको समीक्षा हुन बाँकी छ · प्रमाणित रूपान्तरण सन्दर्भ नभएकाले वि.सं. मिति उपलब्ध छैन',
  'Signed demo record ·':'हस्ताक्षर गरिएको नमुना अभिलेख ·','Patient report · not clinically verified':'बिरामीले दिएको विवरण · चिकित्सकीय पुष्टि भएको छैन',
  'Historical recorded blood group. Follow the treating service\'s verification and compatibility procedures.':'अभिलेखमा रहेको पुरानो रक्त समूह। उपचार टोलीको पुष्टि तथा अनुकूलता जाँच प्रक्रिया पालना गर्नुहोस्।',
  'Recorded allergy:':'अभिलेखमा रहेको एलर्जी:','Review the attributed source; this is not a treatment instruction.':'उल्लेख गरिएको स्रोत जाँच्नुहोस्; यो उपचार निर्देशन होइन।',
  'Handwritten prescription or medical card':'हातले लेखिएको औषधि पुर्जा वा स्वास्थ्य कार्ड','OCR candidate · verify against image':'OCR सुझाव · तस्बिरसँग रुजु गर्नुहोस्',
  'Photograph or upload a handwritten note. Text is recognized on this device and sorted into categories; you correct every line before signing. The original image and raw OCR text are kept as the source.':'हातले लेखिएको कागजको तस्बिर खिच्नुहोस् वा अपलोड गर्नुहोस्। यस उपकरणमै पाठ पहिचान गरी वर्गीकरण गरिन्छ; हस्ताक्षर गर्नुअघि प्रत्येक पङ्क्ति सच्याउनुहोस्। मूल तस्बिर र OCR पाठ स्रोतका रूपमा राखिन्छ।',
  'No patients you can update yet. Hospital clinicians can update patients they registered.':'अहिलेसम्म अद्यावधिक गर्न मिल्ने बिरामी छैनन्। अस्पतालका चिकित्सकले आफूले दर्ता गरेका बिरामीको विवरण अद्यावधिक गर्न सक्छन्।',
  'For best results: lay the note flat in good light, fill the frame with it, and photograph one note at a time.':'राम्रो नतिजाका लागि कागजलाई राम्रो उज्यालोमा सम्याएर राख्नुहोस्, फ्रेमभरि देखिने गरी एक पटकमा एउटा मात्र कागजको तस्बिर खिच्नुहोस्।',
  'Handwritten note':'हातले लेखिएको कागज','Handwritten original for comparison':'तुलना गर्न हातले लेखिएको मूल कागज','Include line:':'यो पङ्क्ति समावेश गर्नुहोस्:',
  'Other reading:':'अर्को सम्भावित पाठ:','Use this reading':'यो पाठ प्रयोग गर्नुहोस्','Corrected text':'सच्याइएको पाठ','Category':'वर्ग','Choose category…':'वर्ग छान्नुहोस्…',
  'Add line':'पङ्क्ति थप्नुहोस्','Date written':'लेखिएको मिति','I compared every included line with the handwritten original':'मैले समावेश गरिएका सबै पङ्क्ति मूल कागजसँग तुलना गरेको छु',
  'Registered':'दर्ता भयो','OCR:':'OCR:','low confidence':'कम विश्वासयोग्य','Dictionary:':'शब्दकोश:',
  'Upload image':'तस्बिर अपलोड गर्नुहोस्','Use camera':'क्यामेरा प्रयोग गर्नुहोस्','Capture':'तस्बिर खिच्नुहोस्','Cancel':'रद्द गर्नुहोस्',
  'Image could not be read.':'तस्बिर पढ्न सकिएन।','Camera unavailable or permission denied. Upload an image instead.':'क्यामेरा उपलब्ध छैन वा अनुमति दिइएन। यसको सट्टा तस्बिर अपलोड गर्नुहोस्।',
  'Register patient':'बिरामी दर्ता गर्नुहोस्','Creates a synthetic Pran Rekha record, a patient login and an opaque QR locator. You can add a face photo now or later. Emergency sharing stays off until the patient approves each entry.':'यसले प्रण रेखामा नमुना अभिलेख, बिरामी प्रवेश र गोप्य QR परिचायक बनाउँछ। अनुहारको तस्बिर अहिले वा पछि थप्न सकिन्छ। बिरामीले प्रत्येक विवरण स्वीकृत नगरेसम्म आपत्कालीन साझेदारी बन्द रहन्छ।',
  'Full name':'पूरा नाम','Date of birth':'जन्ममिति','Blood group':'रक्त समूह','Not recorded':'अभिलेख गरिएको छैन','Recorded allergies':'अभिलेखमा रहेका एलर्जीहरू',
  'e.g. Penicillin — anaphylaxis':'जस्तै: पेनिसिलिन — गम्भीर एलर्जी प्रतिक्रिया','RFID tag UID (optional)':'RFID ट्याग UID (वैकल्पिक)','8, 14 or 20 hex characters':'८, १४ वा २० हेक्साडेसिमल अक्षर',
  'Patient username':'बिरामीको प्रयोगकर्ता नाम','lowercase, 3–32 characters':'सानो अक्षर, ३–३२ वर्ण','Initial password':'सुरुको पासवर्ड','12+ characters':'कम्तीमा १२ वर्ण',
  'Face photo (optional; can be added later)':'अनुहारको तस्बिर (वैकल्पिक; पछि थप्न सकिन्छ)','Loading local face model…':'स्थानीय अनुहार मोडेल लोड हुँदैछ…',
  'Face model unavailable. You can register now and add a photo later.':'अनुहार मोडेल उपलब्ध छैन। अहिले दर्ता गरेर पछि तस्बिर थप्न सक्नुहुन्छ।','Registration photo':'दर्ताको तस्बिर',
  'Checking for exactly one face…':'एउटा मात्र अनुहार छ कि जाँच हुँदैछ…','One face detected. Photo ready.':'एउटा अनुहार भेटियो। तस्बिर तयार छ।',
  'No photo selected. Face matching becomes available after you add one.':'तस्बिर छानिएको छैन। तस्बिर थपेपछि अनुहार मिलान उपलब्ध हुनेछ।','Add photo later':'पछि तस्बिर थप्नुहोस्',
  'Participant consents to storing this face photo on the demo server':'डेमो सर्भरमा यो अनुहारको तस्बिर राख्न सहभागीको सहमति छ',
  'Synthetic demonstration data only — no real patient information':'नमुना प्रदर्शनका लागि मात्र — वास्तविक बिरामीको जानकारी होइन','Username or RFID tag is already registered.':'प्रयोगकर्ता नाम वा RFID ट्याग पहिले नै दर्ता छ।',
  'Some fields are invalid. Check the date of birth and RFID tag UID format.':'केही विवरण अमान्य छन्। जन्ममिति र RFID ट्याग UID को ढाँचा जाँच्नुहोस्।',
  'Patient login:':'बिरामी प्रवेश:','sign in at /patient':'/patient मा साइन इन गर्नुहोस्','Emergency sharing is off until the patient approves entries.':'बिरामीले विवरण स्वीकृत नगरेसम्म आपत्कालीन साझेदारी बन्द रहन्छ।',
  'Registered photo of':'दर्ता गरिएको तस्बिर:','Opaque emergency locator QR for':'गोप्य आपत्कालीन QR परिचायक:',
  'Add or update patient photo':'बिरामीको तस्बिर थप्नुहोस् वा अद्यावधिक गर्नुहोस्','Select an existing patient. Their RFID card and medical record stay linked.':'अभिलेखमा भएको बिरामी छान्नुहोस्। उहाँको RFID कार्ड र स्वास्थ्य अभिलेख जोडिएकै रहन्छ।',
  'Choose patient':'बिरामी छान्नुहोस्','Patient enrollment photo':'बिरामी दर्ताको तस्बिर','One face detected. Ready to save.':'एउटा अनुहार भेटियो। सुरक्षित गर्न तयार छ।',
  'Participant consents to storing this photo for demo face lookup':'डेमो अनुहार खोजका लागि यो तस्बिर राख्न सहभागीको सहमति छ','Save patient photo':'बिरामीको तस्बिर सुरक्षित गर्नुहोस्',
  'Face model unavailable. Try again when the model is available.':'अनुहार मोडेल उपलब्ध छैन। मोडेल उपलब्ध भएपछि फेरि प्रयास गर्नुहोस्।',
  'Photo could not be processed':'तस्बिर प्रशोधन गर्न सकिएन','Photo saved. Face lookup is now available for this patient.':'तस्बिर सुरक्षित भयो। अब यो बिरामीका लागि अनुहार खोज उपलब्ध छ।','Photo could not be saved':'तस्बिर सुरक्षित गर्न सकिएन。',
  'Possible patient lookup':'सम्भावित बिरामी खोज','UNAVAILABLE':'उपलब्ध छैन','LIVE local matcher':'स्थानीय मिलान चालु',
  'Suggests a candidate from an uploaded photo or camera frame. Matching runs in this browser against faces saved at registration and any session-only enrollments. A candidate grants no record access.':'अपलोड गरिएको तस्बिर वा क्यामेरा दृश्यबाट सम्भावित बिरामी सुझाउँछ। मिलान यही ब्राउजरमा दर्ताका तस्बिर र यस सत्रमा थपिएका तस्बिरसँग हुन्छ। सम्भावित मिलानले अभिलेख खोल्दैन।',
  'Consent to face candidate matching for this image':'यो तस्बिरसँग अनुहार मिलान गर्न सहमति दिनुहोस्','Registered faces:':'दर्ता गरिएका अनुहार:','Session-enrolled:':'यस सत्रमा थपिएका:',
  'Identify':'पहिचान गर्नुहोस्','Session enroll (':'यस सत्रमा थप्नुहोस् (','Participant label':'सहभागीको नाम','Synthetic patient':'नमुना बिरामी',
  'Captured image':'खिचिएको तस्बिर','Analysing locally…':'स्थानीय रूपमा विश्लेषण हुँदैछ…','Possible candidate. Record remains locked.':'सम्भावित मिलान। अभिलेख बन्द नै रहन्छ।',
  'Compare the registered photo, then confirm linkage through the RFID, QR or manual locator workflow before any record access.':'दर्ता गरिएको तस्बिरसँग तुलना गर्नुहोस्, त्यसपछि अभिलेख खोल्नुअघि RFID, QR वा परिचायक कोडबाट पहिचान पुष्टि गर्नुहोस्।',
  'No enrolled candidate is plausible for this image.':'यो तस्बिरसँग मिल्ने सम्भावित व्यक्ति भेटिएन।','Too many plausible candidates. Use the locator route.':'धेरै सम्भावित व्यक्ति भेटिए। परिचायक प्रयोग गर्नुहोस्।',
  'Matcher unavailable. Use the locator route.':'मिलान सेवा उपलब्ध छैन। परिचायक प्रयोग गर्नुहोस्।','Session gallery':'यस सत्रका तस्बिर','Clear session gallery':'सत्रका तस्बिर हटाउनुहोस्',
  'Documents and medication history':'कागजात र औषधिको इतिहास','Import JPEG, PNG or text PDF (10 MiB maximum)':'JPEG, PNG वा पाठ PDF आयात गर्नुहोस् (अधिकतम १० MiB)',
  'File exceeds 10 MiB.':'फाइल १० MiB भन्दा ठूलो छ।','Source document':'स्रोत कागजात','Select source':'स्रोत छान्नुहोस्','Download private original':'मूल निजी फाइल डाउनलोड गर्नुहोस्',
  'Page':'पृष्ठ','No extracted text. Enter an attributed manual transcription below.':'पाठ निकाल्न सकिएन। तल स्रोत उल्लेख गरी हातैले उतार्नुहोस्।','Source start (UTF-16 offset)':'स्रोतको सुरु (UTF-16 स्थान)',
  'Source end':'स्रोतको अन्त्य','Confirmed value':'पुष्टि गरिएको विवरण','Confirm source and patient':'स्रोत र बिरामी पुष्टि गर्नुहोस्','Effective clinical date':'लागू हुने चिकित्सकीय मिति',
  'Attributed statement / source evidence':'स्रोत उल्लेख वा प्रमाण','Add immutable prescription':'परिवर्तन गर्न नमिल्ने औषधि पुर्जा थप्नुहोस्','Drug as written':'पुर्जामा लेखिएको औषधि','Dose as written':'पुर्जामा लेखिएको मात्रा',
  'Frequency as written':'पुर्जामा लेखिएको सेवन तालिका','Save prescription evidence':'औषधि पुर्जाको प्रमाण सुरक्षित गर्नुहोस्','Event kind':'घटनाको प्रकार',
  'Target event ID (correction/retraction)':'लक्षित घटना ID (सच्याउने/हटाउने)','Replacement event/record ID':'वैकल्पिक घटना/अभिलेख ID','Append event':'घटना थप्नुहोस्',
  'Add attributed use report':'औषधि प्रयोगको विवरण थप्नुहोस्','Record:':'अभिलेख:','Reported by':'विवरण दिने व्यक्ति','at':'समय','last dose':'अन्तिम मात्रा','unknown':'थाहा छैन',
  'Connected break-glass review':'जडित आपत्कालीन विशेष पहुँच समीक्षा','Requires a distinct clinician approval. Explicitly revoked scopes remain unavailable.':'अर्को चिकित्सकको स्वीकृति आवश्यक छ। स्पष्ट रूपमा रद्द गरिएको पहुँच उपलब्ध हुँदैन।',
  'Load approval queue':'स्वीकृति सूची लोड गर्नुहोस्','Approve five-minute access':'पाँच मिनेटको पहुँच स्वीकृत गर्नुहोस्','Request independent approval':'स्वतन्त्र स्वीकृति अनुरोध गर्नुहोस्','Check approval':'स्वीकृति जाँच्नुहोस्',
  'Unconscious polytrauma':'बेहोस बहु-अङ्ग चोट','Road traffic collision':'सडक दुर्घटना','Cardiac event':'मुटुसम्बन्धी घटना','Respiratory distress':'श्वासप्रश्वासमा कठिनाइ',
  'Burns':'पोलेको चोट','Fall from height':'उचाइबाट खसेको','Other':'अन्य',
  'Active':'सक्रिय','Revoked':'रद्द गरियो','fresh':'नयाँ','aging':'पुरानो हुँदै','expired':'म्याद सकियो','vital':'महत्त्वपूर्ण स्वास्थ्य मापन',
  'medication':'औषधि','allergy':'एलर्जी','condition':'स्वास्थ्य अवस्था','implant':'शरीरभित्र राखिएको उपकरण','blood group':'रक्त समूह','donor':'दाता',
  'Request failed':'अनुरोध असफल भयो','Session expired. Unlock again.':'सत्रको म्याद सकियो। फेरि खोल्नुहोस्।','Reader:':'रिडर:',
  'Session active':'सत्र सक्रिय','Session required':'सत्र आवश्यक','Pre-arrival emergency record review':'आगमनअघि आपत्कालीन अभिलेख समीक्षा',
  'SIMULATED QR scan of the demo pass.':'नमुना परिचयपत्रको QR स्क्यान।','SIMULATED':'नमुना','Reader: ':'रिडर: ',
  ' · ETA ':' · अनुमानित समय ',' min · ':' मिनेट · ','Arriving in ':'आगमन हुन बाँकी ',' minutes':' मिनेट',
  'Signed in · ':'प्रवेश गरिएको · ','Signed in':'प्रवेश गरिएको',
  'FRESH':'अद्यावधिक','AGING':'पुरानो हुँदै','EXPIRED':'म्याद सकियो','blood_group':'रक्त समूह',
  'CANDIDATES':'सम्भावित मिलान','NO MATCH':'मिलान भेटिएन','AMBIGUOUS':'एकभन्दा बढी सम्भावित मिलान',
  ' entries':' विवरणहरू',' records':' अभिलेखहरू','Recorded allergy: ':'अभिलेखमा रहेको एलर्जी: ','Recorded blood group ':'अभिलेखमा रहेको रक्त समूह ',
  ' · verify per transfusion protocol':' · रगत चढाउने प्रक्रिया अनुसार पुष्टि गर्नुहोस्','Approved summary (':'स्वीकृत सारांश (',
  ' entries)':' विवरण)',' (':' (','Report':'विवरण','Profile':'प्रोफाइल',
  'Demo clinician attestation':'नमुना चिकित्सकको प्रमाणीकरण',
  'PRAN REKHA / ':'प्राण रेखा / ','PATIENT':'बिरामी','PARAMEDIC':'प्यारामेडिक','HOSPITAL':'अस्पताल','LAB':'प्रयोगशाला',
  ' · Unit ':' · एकाइ ',' · revision ':' · संशोधन ','revision ':'संशोधन ',
  'started':'सुरु भयो','status confirmed':'स्थिति पुष्टि भयो','held':'रोकियो','resumed':'पुनः सुरु भयो','stopped':'बन्द भयो',
  'completed':'पूरा भयो','dose changed':'मात्रा परिवर्तन भयो','substituted':'औषधि प्रतिस्थापन भयो','corrected':'सच्याइयो',
  'retracted':'फिर्ता लिइयो','documented active':'सक्रिय भनेर अभिलेख गरिएको','historical':'पुरानो अभिलेख','uncertain':'अनिश्चित',
  'draft':'मस्यौदा','confirmed':'पुष्टि भयो','cancelled':'रद्द भयो','pending':'प्रतीक्षामा',
  'Preparing the photo…':'तस्बिर तयार हुँदैछ…','Finding lines of writing…':'लेखिएका पङ्क्ति खोजिँदैछ…',
  'Downloading the handwriting model ':'हस्तलेखन मोडेल डाउनलोड हुँदैछ ',' (first time only, about 64 MB)…':' (पहिलो पटक मात्र, करिब ६४ MB)…',
  'Reading line ':'पङ्क्ति पढिँदैछ ',' of ':' मध्ये ',' on this device…':' यस उपकरणमा…',
  'No text recognized. Add lines manually or retake a sharper, well-lit photo.':'कुनै पाठ पहिचान भएन। पङ्क्ति हातैले थप्नुहोस् वा राम्रो उज्यालोमा स्पष्ट तस्बिर फेरि खिच्नुहोस्।',
  'OCR engine unavailable. Add lines manually from the image.':'OCR सेवा उपलब्ध छैन। तस्बिरबाट पङ्क्ति हातैले थप्नुहोस्।',
  'Correct each line and its category against the image.':'तस्बिरसँग तुलना गरी प्रत्येक पङ्क्ति र वर्ग सच्याउनुहोस्।',
  ' entr':' विवरण','y signed. Patient approval is required for emergency sharing.':' मा हस्ताक्षर भयो। आपत्कालीन साझेदारीका लागि बिरामीको स्वीकृति आवश्यक छ।',
  'ies signed. Patient approval is required for emergency sharing.':' विवरणमा हस्ताक्षर भयो। आपत्कालीन साझेदारीका लागि बिरामीको स्वीकृति आवश्यक छ।',
  'The record changed since you started. Reload and review again.':'तपाईंले सुरु गरेपछि अभिलेख परिवर्तन भयो। फेरि लोड गरेर समीक्षा गर्नुहोस्।',
  'Signing failed':'हस्ताक्षर असफल भयो',
  'Remove ':'हटाउनुहोस् ',
};

function translate(value: string): string {
  const exact = ne[value];
  if (exact) return exact;
  const normalized = ne[value.replaceAll('_', ' ')];
  if (normalized) return normalized;
  let match = value.match(/^(\d+) days until review$/);
  if (match) return `${match[1]} दिनपछि पुनरावलोकन`;
  match = value.match(/^(\d+) line\(s\) recognized\. Correct each line and its category against the image\.$/);
  if (match) return `${match[1]} पङ्क्ति पहिचान भयो। तस्बिरसँग तुलना गरी प्रत्येक पङ्क्ति र वर्ग सच्याउनुहोस्।`;
  match = value.match(/^Downloading the handwriting model (\d+)% \(first time only, about 64 MB\)…$/);
  if (match) return `हस्तलेखन मोडेल डाउनलोड हुँदैछ ${match[1]}% (पहिलो पटक मात्र, करिब ६४ MB)…`;
  match = value.match(/^Reading line (\d+) of (\d+) on this device…$/);
  if (match) return `यस उपकरणमा ${match[2]} मध्ये ${match[1]} औँ पङ्क्ति पढिँदैछ…`;
  match = value.match(/^Session gallery holds at most (\d+) participants\.$/);
  if (match) return `यस सत्रको तस्बिर सङ्ग्रहमा बढीमा ${match[1]} सहभागी राख्न मिल्छ।`;
  match = value.match(/^(\d+) entr(?:y|ies) signed\. Patient approval is required for emergency sharing\.$/);
  if (match) return `${match[1]} विवरणमा हस्ताक्षर भयो। आपत्कालीन साझेदारीका लागि बिरामीको स्वीकृति आवश्यक छ।`;
  match = value.match(/^(\d+) entries$/);
  if (match) return `${match[1]} विवरण`;
  match = value.match(/^(\d+) records$/);
  if (match) return `${match[1]} अभिलेख`;
  match = value.match(/^(\d+) offline access receipt\(s\) synchronised\.$/);
  if (match) return `${match[1]} अफलाइन पहुँच विवरण समक्रमित भयो।`;
  match = value.match(/^Session enroll \((\d+)\/(\d+)\)$/);
  if (match) return `यस सत्रमा थप्नुहोस् (${match[1]}/${match[2]})`;
  match = value.match(/^Include line: (.*)$/);
  if (match) return `यो पङ्क्ति समावेश गर्नुहोस्: ${match[1]}`;
  match = value.match(/^Remove (.*)$/);
  if (match) return `हटाउनुहोस् ${match[1]}`;
  match = value.match(/^Registered photo of (.*)$/);
  if (match) return `${match[1]} को दर्ता गरिएको तस्बिर`;
  match = value.match(/^Opaque emergency locator QR for (.*)$/);
  if (match) return `${match[1]} का लागि गोप्य आपत्कालीन QR परिचायक`;
  return value;
}

function translateTree(node: ReactNode): ReactNode {
  if (typeof node === 'string') return translate(node);
  if (Array.isArray(node)) return node.map(translateTree);
  if (!isValidElement(node)) return node;
  const props = node.props as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const key of ['aria-label', 'alt', 'title', 'placeholder']) {
    if (typeof props[key] === 'string') next[key] = translate(props[key] as string);
  }
  if (props.children !== undefined) next.children = translateTree(props.children as ReactNode);
  return cloneElement(node, next);
}

export function Localized({ children }: { children: ReactNode }) {
  const language = usePreferences(state => state.language);
  return <>{language === 'ne' ? translateTree(children) : children}</>;
}
