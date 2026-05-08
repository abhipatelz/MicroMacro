// ─── QA Knowledge Base ────────────────────────────────────────────────────────
// Every answer is curated, regulatory-accurate, and fully auditable.
// No external AI API needed — this runs on-server, free forever.

export interface KBEntry {
  id: string;
  keywords: string[];          // all lowercase — matched against user query
  title: string;
  summary: string;             // 2–3 sentence plain-English answer
  detail: string;              // deeper explanation
  regulatory: string;          // refs: 21 CFR, ICH, GAMP, etc.
  steps: string[];             // actionable next steps
}

export const KB: KBEntry[] = [
  // ── Shared login / credentials ───────────────────────────────────────────
  {
    id: 'shared-login',
    keywords: ['shared login','shared account','shared credentials','shared password','generic user','shared user','same account','multiple users same login','common login'],
    title: 'Shared Login Used to Approve a Document',
    summary: 'Yes — this is a data integrity finding. Using a shared login to approve a GxP document violates ALCOA+ (Attributable principle): the record cannot be attributed to a specific individual. This is a regulatory red flag.',
    detail: `The "A" in ALCOA+ stands for Attributable — every action in a GxP system must be traceable to a specific, identifiable person. Shared logins break this fundamentally.\n\nThis typically triggers:\n• A **Major deviation** (not minor — attributability failures are serious)\n• An immediate CAPA to disable the shared account and enforce individual credentials\n• A retrospective review of all records approved under that shared login\n• Retraining on 21 CFR Part 11 and ALCOA+ for all affected users\n\nIf this is discovered during an inspection, expect a 483 observation or Warning Letter citation.`,
    regulatory: '21 CFR Part 11.10(d) — individual accountability; ALCOA+ principles; EU Annex 11 §12.1',
    steps: [
      'Immediately disable the shared login account — no further use while investigation is open.',
      'Log a Major deviation in Pragati: describe which document was approved, when, and who had access to the shared credentials.',
      'Identify every GxP record approved or modified using that shared login and list them in the deviation.',
      'Raise a CAPA: corrective action = create individual accounts for all affected users; preventive = system configuration to block shared accounts.',
      'Brief your QA lead and IT admin today — do not wait for a scheduled meeting.',
      'Schedule ALCOA+ and 21 CFR Part 11 refresher training for the impacted team.',
    ],
  },

  // ── Audit trail disabled ─────────────────────────────────────────────────
  {
    id: 'audit-trail-disabled',
    keywords: ['audit trail disabled','audit trail off','turned off audit','disabled audit','audit trail missing','no audit trail','audit trail gap','audit trail was off'],
    title: 'Audit Trail Was Disabled',
    summary: 'A disabled audit trail in a GxP system is a critical data integrity violation. All activity during the gap period is potentially unattributable, creating significant regulatory exposure.',
    detail: `An audit trail must be continuously active for all GxP-critical computerized systems (21 CFR Part 11, EU Annex 11). Even a brief gap creates a window where records could have been created, modified, or deleted without a trace.\n\nKey questions to answer in your investigation:\n• How long was it disabled? (minutes vs days changes severity)\n• Who disabled it and how? (accidental vs intentional is a major factor)\n• What GxP activities occurred during the gap?\n• Were any records created or changed during this period?\n\nThis is typically a **Critical deviation** if it lasted more than a few minutes or if any GxP records were touched during the gap.`,
    regulatory: '21 CFR Part 11.10(e); EU Annex 11 §9; ALCOA+ (Contemporaneous, Attributable)',
    steps: [
      'Immediately re-enable the audit trail and document the exact time it was restored.',
      'Log a Critical deviation — include the exact start and end time the trail was disabled.',
      'Perform a retrospective review: list every record created or modified during the gap period.',
      'Assess each record\'s integrity — flag any that cannot be verified as accurate.',
      'Raise a CAPA: corrective = restore and lock audit trail configuration; preventive = add monitoring alerts if trail is disabled.',
      'Notify your QA director — this type of finding is reportable to management under ICH Q10.',
    ],
  },

  // ── What is a deviation ──────────────────────────────────────────────────
  {
    id: 'what-is-deviation',
    keywords: ['what is a deviation','what is deviation','do i need a deviation','when do i need a deviation','is this a deviation','need to raise deviation','should i log deviation','what counts as deviation'],
    title: 'What Is a Deviation and When Do You Need One?',
    summary: 'A deviation is any departure from an approved procedure, specification, or standard — whether planned or unplanned. If something happened differently from how your SOP says it should happen, you likely need a deviation.',
    detail: `**Simple test:** Ask yourself "Did we follow the approved procedure exactly?" If the answer is no — for any reason — you need a deviation.\n\nCommon examples that require a deviation:\n• A step was skipped or done out of order\n• Equipment was used that wasn\'t listed in the procedure\n• A batch was processed at the wrong temperature or time\n• A document was approved late\n• A system was used while in an unqualified state\n• A test failed unexpectedly (Out of Specification / OOS)\n\n**Minor deviation:** Low impact, no patient risk, correctable. Example: documentation error with no GxP impact.\n**Major deviation:** Moderate impact, potential quality effect. Example: procedure step missed but product was not released.\n**Critical deviation:** Patient safety risk, possible regulatory breach, product released with a known issue.\n\nWhen in doubt — log it. An unnecessary deviation costs you 30 minutes. Missing a required deviation can cost you an inspection finding.`,
    regulatory: '21 CFR 211.192 (investigation of failures); ICH Q10 §3.2.2',
    steps: [
      'Ask: "Did anything happen differently from what the SOP says?" If yes, open a deviation.',
      'Open Pragati → New Project → Deviation lifecycle to start the process.',
      'Write a description: what happened, when, which SOP or specification was affected, what the immediate impact was.',
      'Classify severity: Minor (documentation only), Major (process deviated, no release), Critical (patient/product risk).',
      'Describe the immediate containment action you already took.',
      'Assign an investigator and set a 30-day closure target.',
    ],
  },

  // ── CAPA ─────────────────────────────────────────────────────────────────
  {
    id: 'capa',
    keywords: ['capa','corrective action','preventive action','corrective and preventive','root cause','rca','5 why','fishbone','cause analysis','effectiveness check','capa closure'],
    title: 'CAPA — Corrective and Preventive Action',
    summary: 'A CAPA addresses the root cause of a quality problem (corrective) and prevents it from happening again elsewhere (preventive). It\'s more than just "we fixed it" — you need to prove you found the real cause and eliminated it.',
    detail: `**Corrective Action (CA):** Fixes the specific problem that occurred.\n**Preventive Action (PA):** Stops the same problem from occurring elsewhere or in the future.\n\nThe 5-Why process:\n1. Why did it happen? → Answer 1\n2. Why did Answer 1 happen? → Answer 2\n3. Why did Answer 2 happen? → Answer 3\n4. Why did Answer 3 happen? → Answer 4\n5. Why did Answer 4 happen? → Root Cause\n\nA CAPA is closed only when:\n• The corrective action is implemented and verified\n• The preventive action is in place\n• An effectiveness check has been scheduled (typically 30–90 days post-closure)\n• The effectiveness check has been completed and confirmed the issue hasn\'t recurred`,
    regulatory: 'ICH Q10 §3.2.3; 21 CFR 820.100 (medical devices); FDA CAPA guidance',
    steps: [
      'Open Pragati → New Project → CAPA lifecycle.',
      'Write a clear problem statement: what happened, how often, what the impact was.',
      'Conduct root cause analysis using 5-Why or fishbone diagram — document each step.',
      'Define corrective action: the specific fix, who owns it, and the deadline.',
      'Define preventive action: what systemic change prevents recurrence elsewhere.',
      'Schedule an effectiveness check 30–90 days after CAPA closure to confirm the issue is resolved.',
    ],
  },

  // ── Change control ───────────────────────────────────────────────────────
  {
    id: 'change-control',
    keywords: ['change control','change request','system change','process change','when do i need change control','do i need change control','raise a change','change approval','change control process','configuration change'],
    title: 'Change Control — When and How',
    summary: 'Any planned change to a validated system, approved procedure, or critical equipment that could affect product quality or patient safety needs a change control. The key word is planned — if it was unplanned and already happened, that\'s a deviation.',
    detail: `**When you need change control:**\n• Modifying a validated software system (any change to code, config, or infrastructure)\n• Updating an SOP or batch record\n• Changing equipment, suppliers, or raw materials\n• Moving a process to a new location or server\n• Changing access rights on a GxP system\n• Adding new functionality to a validated system\n\n**When you do NOT need change control:**\n• Break-fix patches that restore the system to its original validated state (may need a deviation instead)\n• Non-GxP system changes with no quality impact\n• Changes in non-validated environments (dev/test, clearly segregated)\n\n**Emergency change:** Required immediately to prevent greater harm. Documented retrospectively but still requires full change control documentation.`,
    regulatory: 'ICH Q10 §3.2.4; 21 CFR Part 11; EU Annex 11 §10; GAMP 5',
    steps: [
      'Open Pragati → New Project → Change Control lifecycle.',
      'Describe the proposed change: what is changing, why, what the current state is.',
      'Perform an impact assessment: does this affect validated state? GxP records? Patient safety?',
      'Identify if re-validation (IQ/OQ/PQ) or just re-testing is needed based on GAMP 5 category.',
      'Get sign-off from QA, the process owner, and IT (if a system change).',
      'Schedule the change in a maintenance window and document the actual implementation.',
      'Close the change control with evidence that the change was implemented as planned.',
    ],
  },

  // ── GAMP 5 / Software categories ─────────────────────────────────────────
  {
    id: 'gamp5',
    keywords: ['gamp','gamp 5','software category','category 1','category 3','category 4','category 5','what category','gamp category','infrastructure software','configured software','custom software','validation category'],
    title: 'GAMP 5 Software Categories — Which Applies to Your System?',
    summary: 'GAMP 5 categorizes software by the level of validation effort required. The higher the category, the more custom the software and the more validation work needed.',
    detail: `**Category 1 — Infrastructure software** (no direct validation needed)\nExamples: Operating systems (Windows, Linux), network infrastructure, standard office tools not used for GxP records.\n\n**Category 3 — Non-configured products** (minimal validation)\nExamples: Standard COTS software used as-is. Verify correct installation, document the intended use.\n\n**Category 4 — Configured products** (moderate validation: IQ/OQ, some PQ)\nExamples: LIMS configured with custom workflows, ERP with pharma modules. Configuration records are part of the validated state.\n\n**Category 5 — Custom/bespoke software** (full validation: IQ/OQ/PQ, URS, code review)\nExamples: Custom-built web applications for GxP purposes, bespoke laboratory systems.\n\n**For your custom web app (Pragati-style):** Category 4 or 5 depending on how much custom code exists. Requires URS, risk assessment, IQ/OQ/PQ, and change control for all future changes.`,
    regulatory: 'GAMP 5 2nd Edition; EU Annex 11; FDA 21 CFR Part 11',
    steps: [
      'Identify whether your system is COTS (buy), configured COTS, or custom-built.',
      'Assign GAMP category: 1 (infrastructure), 3 (COTS as-is), 4 (configured), 5 (custom code).',
      'For Cat 4/5: write a User Requirements Specification (URS) if not already done.',
      'Create a Validation Plan and Risk Assessment document.',
      'Execute IQ (installation), OQ (operational), PQ (performance) testing and document results.',
      'Raise a change control for any future modifications to the validated system.',
    ],
  },

  // ── CSV / IQ OQ PQ ───────────────────────────────────────────────────────
  {
    id: 'csv-iqoqpq',
    keywords: ['csv','iq','oq','pq','iq oq pq','qualification','validation','computer system validation','system validation','validate a system','validation protocol','installation qualification','operational qualification','performance qualification'],
    title: 'Computer System Validation (CSV) — IQ/OQ/PQ Explained',
    summary: 'CSV is the documented evidence that a computerized system consistently does what it\'s supposed to do. IQ/OQ/PQ are the three phases of testing that prove this.',
    detail: `**IQ — Installation Qualification**\nProves the system was installed correctly.\n• Hardware/software installed as per spec\n• Configuration settings documented\n• Required certificates and licenses in place\n\n**OQ — Operational Qualification**\nProves the system operates correctly per its specifications.\n• Functional tests against the URS (User Requirements Spec)\n• Boundary/negative testing (what happens when input is wrong?)\n• Test each function described in the URS\n\n**PQ — Performance Qualification**\nProves the system performs correctly in the actual intended use environment.\n• Run tests that simulate real business processes\n• Include worst-case scenarios\n• Often run with real users on real data (test environment)\n\n**Order matters:** You cannot do OQ before IQ is approved, or PQ before OQ is approved.`,
    regulatory: 'GAMP 5; EU Annex 11; FDA Process Validation Guidance; ICH Q9',
    steps: [
      'Write or obtain a User Requirements Specification (URS) — this drives all your test cases.',
      'Create a Validation Plan: scope, responsibilities, timeline, and which protocols are needed.',
      'Execute IQ protocol: verify installation, document configuration, get QA sign-off.',
      'Execute OQ protocol: test each URS requirement, document pass/fail, investigate failures.',
      'Execute PQ protocol: simulate real use cases, involve actual end users, document results.',
      'Compile the Validation Summary Report and get QA approval before going live.',
    ],
  },

  // ── Out of specification / OOS ────────────────────────────────────────────
  {
    id: 'oos',
    keywords: ['oos','out of specification','out of spec','failed test','test failure','unexpected result','failed result','specification failure','lab failure'],
    title: 'Out of Specification (OOS) Result',
    summary: 'An OOS result means a test result falls outside the approved specification limits. You cannot dismiss it without a full investigation — releasing product based on an uninvestigated OOS is a serious regulatory violation.',
    detail: `**Phase 1 — Laboratory Investigation (complete within 20 business days)**\nLook for assignable laboratory causes: calculation errors, instrument malfunction, analyst error, sample handling issues. If a root cause is found AND documented, an invalidated result may be appropriate.\n\n**Phase 2 — Full OOS Investigation (if Phase 1 finds nothing)**\nExpands to manufacturing investigation: process parameters, raw materials, equipment, environment. This may result in retesting if statistically justified — but not simply to get a passing result (this is "testing into compliance" and is illegal).\n\n**Key rules:**\n• Never discard a failing result without documented justification\n• Retesting must be pre-defined, not done simply because the first result failed\n• If confirmed OOS: batch investigation, potential rejection, and deviation required`,
    regulatory: '21 CFR 211.192; FDA OOS Guidance (2006); ICH Q2(R2)',
    steps: [
      'Stop and do NOT release the batch — place it on hold immediately.',
      'Log a deviation in Pragati and flag it as OOS.',
      'Start Phase 1 lab investigation: check calculations, instrument logs, reagent status, analyst competency.',
      'Document all Phase 1 findings — even if you find nothing.',
      'If no lab error found, escalate to Phase 2 manufacturing investigation.',
      'Make a documented batch disposition decision (release, reject, reprocess) based on the investigation outcome.',
    ],
  },

  // ── Document control ─────────────────────────────────────────────────────
  {
    id: 'document-control',
    keywords: ['document control','sop update','sop revision','update a procedure','revise document','document version','effective date','training before use','document approval','obsolete document','supersede document'],
    title: 'Document Control — Updating a GxP Document',
    summary: 'Every GxP document (SOP, batch record, protocol) must follow a defined lifecycle: draft → review → approval → effective. You cannot use a document before it\'s approved, and you must train people before its effective date.',
    detail: `**SOP Change Process:**\n1. Initiate revision — document the reason for the change\n2. Draft the updated version with change tracking\n3. Route for review (technical review, QA review)\n4. Obtain approval signatures (author, reviewer, QA approver)\n5. Set effective date — minimum 2 weeks away to allow training\n6. Train affected personnel BEFORE the effective date\n7. Obsolete the previous version on the effective date\n\n**Superseding a document:**\nThe old version must be marked Obsolete and archived (not deleted). Regulators will ask to see version history.\n\n**Emergency SOP change:**\nIf a safety issue requires an immediate procedure change, you can issue a temporary deviation or interim SOP — but the formal change control must follow within 30 days.`,
    regulatory: '21 CFR 211.68; 21 CFR 211.100; ISO 9001 §7.5',
    steps: [
      'Initiate a change control in Pragati for the document revision.',
      'Draft the new version — use tracked changes so reviewers can see what changed and why.',
      'Route for technical review (process owner) and QA review.',
      'Obtain all required approval signatures before setting an effective date.',
      'Communicate the change to all affected personnel — schedule training.',
      'Complete training records BEFORE the effective date — no exceptions.',
      'Obsolete the previous version on the effective date and archive it.',
    ],
  },

  // ── 483 / inspection finding ─────────────────────────────────────────────
  {
    id: 'inspection-483',
    keywords: ['483','inspection finding','fda inspection','audit finding','inspector','warning letter','observation','regulatory inspection','how to respond to 483','prepare for inspection'],
    title: 'Responding to an Inspection Finding (483 Observation)',
    summary: 'A 483 is a list of observations from an FDA inspector — it\'s not a final determination, but your response within 15 business days is critical. A strong, substantive response can prevent escalation to a Warning Letter.',
    detail: `**Immediately after receiving a 483:**\n• Do not panic — a 483 is an observation, not a citation\n• Read each observation carefully — understand exactly what the inspector found\n• For each observation, you need: a response admitting the finding, root cause, corrective action already taken, and preventive action planned\n\n**What makes a strong response:**\n• Acknowledge the finding directly — don't argue unless the observation is factually wrong\n• Show immediate corrective actions already completed\n• Provide realistic timelines for remaining actions (not "we will fix everything in 30 days" if you can't)\n• Include documentary evidence (training records, updated SOPs, system screenshots)\n\n**Escalation path:** 483 → Warning Letter → Consent Decree → Import Alert. Each step increases in severity. A good 483 response rarely escalates.`,
    regulatory: '21 CFR 820; 21 CFR 211; FD&C Act §704',
    steps: [
      'Gather your QA team immediately and read the 483 together — assign an owner to each observation.',
      'Log a CAPA in Pragati for each significant 483 observation.',
      'For each observation: write a clear root cause analysis (use 5-Why).',
      'List corrective actions already taken — even if small, document them with dates and evidence.',
      'List preventive actions planned with realistic completion dates.',
      'Draft your formal response letter — QA director must review and sign.',
      'Submit response within 15 business days of receiving the 483.',
    ],
  },

  // ── Data integrity / ALCOA ───────────────────────────────────────────────
  {
    id: 'data-integrity',
    keywords: ['data integrity','alcoa','alcoa+','attributable','legible','contemporaneous','original','accurate','backdating','back dating','falsification','data manipulation','raw data','original data','cgs','complete consistent'],
    title: 'Data Integrity and ALCOA+',
    summary: 'ALCOA+ defines the standards for GxP data quality. Every record you create must be Attributable, Legible, Contemporaneous, Original, and Accurate — plus Complete, Consistent, Enduring, and Available.',
    detail: `**ALCOA+ broken down:**\n• **A — Attributable:** Who did it and when? (individual logins, electronic signatures)\n• **L — Legible:** Can it be read and understood forever? (no pencil, clear handwriting, no Tipp-Ex)\n• **C — Contemporaneous:** Recorded at the time it happened (no filling in later)\n• **O — Original:** The first record (not a copy — unless clearly marked)\n• **A — Accurate:** Reflects what actually happened\n• **+ Complete:** All data, including failures and repeats\n• **+ Consistent:** Dates, times, and sequences are logical\n• **+ Enduring:** Records survive for the required retention period\n• **+ Available:** Accessible for inspection when requested\n\n**Most common violations:**\n• Backdating (recording events with an earlier date)\n• Deleting or overwriting original entries\n• Shared logins (breaks Attributable)\n• Recording data on scraps of paper then transcribing (breaks Original/Contemporaneous)`,
    regulatory: 'MHRA Data Integrity Guidance; FDA Data Integrity Draft Guidance; EU Annex 11; ALCOA+ WHO Guidelines',
    steps: [
      'If a data integrity issue occurred: log a deviation immediately, classify as Major or Critical.',
      'Preserve all original records — do not delete or overwrite anything.',
      'Perform a retrospective review of all records potentially affected.',
      'Identify the root cause: training gap, system configuration issue, or deliberate falsification?',
      'Raise a CAPA: correct the specific issue and prevent it system-wide.',
      'Consider whether a Corrective and Preventive Action report to management is required under ICH Q10.',
    ],
  },

  // ── Production change without approval ───────────────────────────────────
  {
    id: 'unapproved-change',
    keywords: ['unapproved change','change without approval','ran without approval','made change without','did not get approval','bypassed change control','skipped change control','implemented change without','production change without'],
    title: 'Made a Change Without Going Through Change Control',
    summary: 'An unapproved change to a validated system is a deviation — it needs to be documented immediately, even if the change turned out to be fine. "It worked" doesn\'t eliminate the compliance obligation.',
    detail: `**What happened:** A change was implemented in a GxP environment without the required change control approval. This is a deviation regardless of outcome.\n\n**Why it matters:**\nChange control exists to assess risk BEFORE a change is made. Even if the change had no negative effect, you violated the principle that changes to validated systems must be pre-approved. An inspector finding this will cite it as evidence of a broken quality system.\n\n**Retrospective change control:**\nYou can document what happened retroactively, but you cannot backdate it. The retrospective documentation must clearly state that it was done after the fact and explain why the change was made without prior approval.`,
    regulatory: 'ICH Q10 §3.2.4; GAMP 5; EU Annex 11 §10',
    steps: [
      'Stop further use of the changed system if there is any doubt about its validated state.',
      'Log a deviation immediately — describe the change made and why change control was bypassed.',
      'Assess the impact: did the change affect any GxP records or validated functionality?',
      'Create a retrospective change control record — document what was changed, when, and by whom.',
      'Do NOT backdate — the retrospective document must clearly state it was written after the fact.',
      'Raise a CAPA: corrective = complete proper change control now; preventive = training and process reinforcement.',
    ],
  },

  // ── Test in production ───────────────────────────────────────────────────
  {
    id: 'test-in-production',
    keywords: ['test in production','ran in production','executed in prod','production environment test','tested on live','live system test','accidentally ran on prod','testing on production'],
    title: 'Test Script Ran on Production System',
    summary: 'Running test scripts or unapproved code on a production GxP system is a serious incident. The validated state of the system may have been compromised, and any data generated is suspect.',
    detail: `**Immediate concerns:**\n• Did the test create, modify, or delete any GxP records?\n• Did it change any system configuration?\n• Can you confirm the system is still in its validated state?\n\n**Why this is serious:**\nTest scripts often create dummy data, modify configurations, or trigger workflows that affect real records. Even "read-only" tests can be problematic if they generated audit trail entries that now appear in real records.\n\n**System re-qualification:**\nDepending on what the test script did, you may need to re-execute OQ/PQ tests to re-confirm the validated state.`,
    regulatory: '21 CFR Part 11; GAMP 5 §5.5; EU Annex 11 §4 (environment segregation)',
    steps: [
      'Stop all production activity on the affected system immediately.',
      'Log a Critical deviation in Pragati — this is not a Minor event.',
      'Review the audit trail: identify every record created, modified, or deleted by the test script.',
      'Quarantine any affected data — flag it as potentially unreliable.',
      'Engage your IT team to assess system state: is the production config still as-validated?',
      'Decide if re-qualification testing is needed before resuming production use.',
      'Raise a CAPA: implement environment segregation so test and production systems cannot be confused.',
    ],
  },

  // ── GMP basics ───────────────────────────────────────────────────────────
  {
    id: 'gmp-basics',
    keywords: ['gmp','good manufacturing practice','second person review','batch record','double check','why do we document','why document everything','why sign everything','why second person','cross check'],
    title: 'GMP Basics — Why All the Documentation?',
    summary: 'GMP (Good Manufacturing Practice) is the set of rules that ensure medicines are consistently produced and controlled to quality standards. Every signature, second check, and record exists to prove the product was made correctly.',
    detail: `**Why document everything?**\nIn GMP, "if it isn't written down, it didn't happen." Documentation creates the evidence trail that allows:\n• Reproducibility — another person can follow the same steps and get the same result\n• Traceability — if a product problem is found, you can trace back to find the cause\n• Accountability — who did what and when\n• Regulatory inspection — inspectors review records to confirm compliance\n\n**Why second-person review?**\nCritical steps require a second person to independently verify the first person's work. This catches errors before they become problems. The second person must physically check and sign — not just countersign a colleague's say-so.\n\n**Batch record completeness:**\nA batch record must be complete before the batch can be released. Every blank must be filled (or crossed out with initials if not applicable). Leaving blanks is a GMP failure.`,
    regulatory: '21 CFR 211; EU GMP Part I; ICH Q7 (API)',
    steps: [
      'Treat every blank in a GxP document as requiring an entry — fill it or mark N/A with initials.',
      'Never pre-sign a document or sign for someone else.',
      'If you make an error: single line through the error, your initials, date, and the correct information — never use correction fluid.',
      'Second-person checks must be independent — the reviewer must verify the actual work, not just the paperwork.',
      'Date and time every entry at the moment you perform the action, not later.',
    ],
  },

  // ── Batch release with issue ──────────────────────────────────────────────
  {
    id: 'batch-released-with-issue',
    keywords: ['released batch','batch released','already released','product already shipped','distributed product','batch on market','recall','market withdrawal','field safety'],
    title: 'Batch Released / Distributed With a Quality Issue',
    summary: 'If a batch has already been released and a quality issue is discovered, the response escalates significantly. You may be looking at a market withdrawal or recall depending on the risk.',
    detail: `**Risk classification determines the response:**\n• **Class I recall:** Serious health risk or death possible — most urgent\n• **Class II recall:** May cause temporary adverse health effects — urgent\n• **Class III recall:** Unlikely to cause health effects but violates regulations\n• **Market withdrawal:** Product removed for minor reasons, not a health hazard\n\n**Key immediate questions:**\n• How many units were distributed and to where?\n• What is the nature of the defect and its patient safety impact?\n• Is there ongoing risk if patients continue taking the product?\n• Have any adverse events been reported?\n\nMost regulatory agencies require notification within specific timeframes (FDA: varies by issue type; EMA: 2-3 working days for Class I/II).`,
    regulatory: '21 CFR 211.192; 21 CFR Part 7 (recalls); FDA Recall Policy; EU GMP Annex 16',
    steps: [
      'Convene an emergency quality meeting immediately — today, not tomorrow.',
      'Log a Critical deviation in Pragati.',
      'Determine the full scope: batch numbers, quantities, and distribution points.',
      'Assess patient/public health risk — get your medical/pharmacovigilance team involved if applicable.',
      'Notify your Qualified Person (QP) or Responsible Official immediately.',
      'Contact your regulatory affairs team — a regulatory notification may be required within 72 hours.',
      'If recall is needed: initiate recall procedure, notify wholesalers/distributors, and set up reconciliation.',
    ],
  },

  // ── Password / access change to GxP system ───────────────────────────────
  {
    id: 'system-access-change',
    keywords: ['access rights','user access','permission change','role change','system access','who can access','restrict access','grant access','access control','user privileges','add user to system'],
    title: 'Changing Access Rights on a GxP System',
    summary: 'Access changes to GxP systems are controlled activities. Adding, removing, or changing user roles must be documented and, in validated systems, may require a change control.',
    detail: `**Principle of least privilege:**\nUsers should only have access to the functions they need for their job. Over-permissioned accounts are a compliance risk.\n\n**What requires change control:**\n• Adding a new role or permission level\n• Granting admin-level access\n• Removing a critical access control\n\n**What requires access management documentation (not full change control):**\n• Adding a new user with standard access\n• Removing a user who has left\n• Role changes within existing permission levels\n\n**Periodic access review:**\nGxP systems should have an access review at least annually. Accounts for people who have left must be disabled promptly — ideally on their last day.`,
    regulatory: '21 CFR Part 11.10(d); EU Annex 11 §12.1; GAMP 5',
    steps: [
      'Document the business justification for the access change — who requested it and why.',
      'Determine if a change control is needed (new role/permission type) or just access management documentation.',
      'Get line manager and QA approval before implementing the change.',
      'Make the access change and document: who made it, when, and what the before/after state was.',
      'Confirm via the system audit trail that the change was applied correctly.',
      'For departing employees: disable access on their last day — do not wait.',
    ],
  },
];

// ── Matching engine ────────────────────────────────────────────────────────────
function scoreEntries(query: string): { entry: KBEntry; score: number }[] {
  const q = query.toLowerCase();
  const scored = KB.map(entry => {
    let score = 0;
    for (const kw of entry.keywords) {
      if (q.includes(kw)) score += kw.split(' ').length * 3;
    }
    const allWords = entry.keywords.join(' ').split(' ');
    for (const word of allWords) {
      if (word.length > 3 && q.includes(word)) score += 1;
    }
    return { entry, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

export function findBestAnswer(query: string): KBEntry | null {
  const scored = scoreEntries(query);
  return scored[0]?.score >= 2 ? scored[0].entry : null;
}

// Top-K relevant entries used to ground the LLM (RAG-style).
// Returns up to `k` entries with score >= minScore, ordered by score desc.
export function findRelevantEntries(query: string, k = 3, minScore = 2): KBEntry[] {
  return scoreEntries(query)
    .filter(s => s.score >= minScore)
    .slice(0, k)
    .map(s => s.entry);
}

// ── General guidance for unmatched questions ──────────────────────────────────
export function generalGuidance(query: string): KBEntry {
  return {
    id: 'general',
    keywords: [],
    title: 'QA Guidance',
    summary: `I don't have a specific pre-built answer for "${query.slice(0, 60)}${query.length > 60 ? '…' : ''}", but here's a general QA decision framework that applies to most situations.`,
    detail: `**Ask yourself these questions first:**\n\n1. **Did something happen differently from the approved procedure?** → Deviation required\n2. **Are you about to change something in a validated system or approved process?** → Change control required\n3. **Is data involved that goes into a GxP record?** → Data integrity rules (ALCOA+) apply\n4. **Will someone rely on this result or record for a quality decision?** → Documentation must be contemporaneous and attributable\n\n**The golden rule:** If you're asking "do I need to document this?" — the answer is almost always yes. The cost of an unnecessary deviation is 30 minutes. The cost of a missing one is an inspection finding.\n\nFor your specific question, reach out to your QA lead or bring it to the next team stand-up. Log it in Pragati even if you're unsure — it creates a record that you identified a potential issue and investigated it.`,
    regulatory: 'ICH Q10 (Pharmaceutical Quality System); 21 CFR 211 (cGMP); EU GMP Part I',
    steps: [
      'Write down exactly what happened or what you\'re planning to do — specifics help your QA lead give better guidance.',
      'Check if there\'s an existing SOP that covers this situation.',
      'If something already happened that deviated from procedure: log a deviation now, even if minor.',
      'If you\'re planning a change: raise it as a change control or informal change request before proceeding.',
      'Talk to your QA lead — most routine QA questions have a 5-minute answer once someone with experience hears it.',
    ],
  };
}
