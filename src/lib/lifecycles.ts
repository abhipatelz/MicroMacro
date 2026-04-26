export type LifecycleKey =
  | 'generic'
  | 'agile_sprint'
  | 'software_release'
  | 'product_launch'
  | 'research'
  | 'csv'
  | 'sop'
  | 'deviation_capa'
  | 'change_control'
  | 'audit'
  | 'validation'
  | 'data_integrity'
  | 'pharmacovigilance';

export type LifecycleGroup = 'General' | 'Life Sciences';

export interface LifecycleTaskTemplate {
  title: string;
  type:
    | 'task'
    | 'review'
    | 'approval'
    | 'test'
    | 'deviation'
    | 'capa'
    | 'audit_finding'
    | 'data_review';
  qa?: boolean;
  gxp?: boolean;
}

export interface LifecyclePhaseTemplate {
  name: string;
  tasks: LifecycleTaskTemplate[];
}

export interface LifecycleTemplate {
  label: string;
  description: string;
  regulatoryRefs: string;
  group: LifecycleGroup;
  phases: LifecyclePhaseTemplate[];
}

export const LIFECYCLES: Record<LifecycleKey, LifecycleTemplate> = {
  generic: {
    label: 'Generic project',
    description: 'A flexible, freeform project with no predefined lifecycle.',
    regulatoryRefs: '',
    group: 'General',
    phases: [
      { name: 'Planning', tasks: [{ title: 'Kick-off', type: 'task' }] },
      { name: 'Execution', tasks: [{ title: 'Work item', type: 'task' }] },
      { name: 'Closure', tasks: [{ title: 'Wrap-up & retrospective', type: 'review' }] }
    ]
  },

  agile_sprint: {
    label: 'Agile Sprint',
    description: 'Time-boxed iteration with planning, execution, review, and retrospective.',
    regulatoryRefs: '',
    group: 'General',
    phases: [
      {
        name: 'Sprint Planning',
        tasks: [
          { title: 'Backlog refinement & story pointing', type: 'review' },
          { title: 'Sprint goal definition', type: 'task' },
          { title: 'Capacity planning', type: 'task' },
        ]
      },
      {
        name: 'Development',
        tasks: [
          { title: 'Daily standups', type: 'task' },
          { title: 'Feature development', type: 'task' },
          { title: 'Code review', type: 'review' },
          { title: 'Unit & integration tests', type: 'test' },
        ]
      },
      {
        name: 'Review & Release',
        tasks: [
          { title: 'Sprint demo / review', type: 'review' },
          { title: 'QA acceptance testing', type: 'test' },
          { title: 'Deploy to staging', type: 'task' },
          { title: 'Stakeholder sign-off', type: 'approval' },
        ]
      },
      {
        name: 'Retrospective',
        tasks: [
          { title: 'Team retrospective', type: 'review' },
          { title: 'Action items log', type: 'task' },
        ]
      }
    ]
  },

  software_release: {
    label: 'Software Release',
    description: 'End-to-end release cycle from scoping through post-launch monitoring.',
    regulatoryRefs: '',
    group: 'General',
    phases: [
      {
        name: 'Scoping & Design',
        tasks: [
          { title: 'Requirements documentation', type: 'task' },
          { title: 'Technical design review', type: 'review' },
          { title: 'Architecture sign-off', type: 'approval' },
        ]
      },
      {
        name: 'Build',
        tasks: [
          { title: 'Feature development', type: 'task' },
          { title: 'Code reviews', type: 'review' },
          { title: 'Security review', type: 'review' },
        ]
      },
      {
        name: 'Testing',
        tasks: [
          { title: 'Unit test coverage review', type: 'test' },
          { title: 'Integration / E2E tests', type: 'test' },
          { title: 'Performance & load testing', type: 'test' },
          { title: 'UAT sign-off', type: 'approval' },
        ]
      },
      {
        name: 'Release',
        tasks: [
          { title: 'Deploy to production', type: 'task' },
          { title: 'Smoke tests post-deploy', type: 'test' },
          { title: 'Release notes published', type: 'task' },
        ]
      },
      {
        name: 'Post-Launch',
        tasks: [
          { title: 'Monitor error rates & SLOs', type: 'task' },
          { title: 'Post-launch retrospective', type: 'review' },
        ]
      }
    ]
  },

  product_launch: {
    label: 'Product Launch',
    description: 'Cross-functional launch lifecycle from strategy through go-live.',
    regulatoryRefs: '',
    group: 'General',
    phases: [
      {
        name: 'Strategy',
        tasks: [
          { title: 'Market research & positioning', type: 'review' },
          { title: 'Launch brief approval', type: 'approval' },
          { title: 'Success metrics defined (OKRs)', type: 'task' },
        ]
      },
      {
        name: 'Build & Content',
        tasks: [
          { title: 'Landing page / product page', type: 'task' },
          { title: 'Marketing collateral', type: 'task' },
          { title: 'Demo / onboarding flow', type: 'task' },
        ]
      },
      {
        name: 'Pre-Launch',
        tasks: [
          { title: 'Internal beta test', type: 'test' },
          { title: 'Sales enablement materials', type: 'task' },
          { title: 'Press / communications review', type: 'review' },
          { title: 'Leadership launch approval', type: 'approval' },
        ]
      },
      {
        name: 'Launch',
        tasks: [
          { title: 'Go-live execution', type: 'task' },
          { title: 'Social / email announcements', type: 'task' },
        ]
      },
      {
        name: 'Post-Launch',
        tasks: [
          { title: 'KPI review — week 1', type: 'data_review' },
          { title: 'Feedback synthesis', type: 'review' },
          { title: 'Launch retrospective', type: 'review' },
        ]
      }
    ]
  },

  research: {
    label: 'Research Project',
    description: 'Structured research lifecycle from question through published findings.',
    regulatoryRefs: '',
    group: 'General',
    phases: [
      {
        name: 'Scoping',
        tasks: [
          { title: 'Research question & hypothesis', type: 'task' },
          { title: 'Literature review', type: 'review' },
          { title: 'Methodology design', type: 'task' },
        ]
      },
      {
        name: 'Data Collection',
        tasks: [
          { title: 'Data collection execution', type: 'task' },
          { title: 'Data quality check', type: 'data_review' },
        ]
      },
      {
        name: 'Analysis',
        tasks: [
          { title: 'Statistical / qualitative analysis', type: 'task' },
          { title: 'Peer review of analysis', type: 'review' },
        ]
      },
      {
        name: 'Reporting',
        tasks: [
          { title: 'Draft report / paper', type: 'task' },
          { title: 'Internal review', type: 'review' },
          { title: 'Stakeholder sign-off', type: 'approval' },
        ]
      }
    ]
  },

  csv: {
    label: 'Computer System Validation (CSV / GAMP 5)',
    description:
      'Validation lifecycle for GxP computerized systems, aligned with GAMP 5 and 21 CFR Part 11 / EU Annex 11.',
    regulatoryRefs: '21 CFR Part 11, EU Annex 11, GAMP 5',
    group: 'Life Sciences',
    phases: [
      {
        name: 'Planning & Risk Assessment',
        tasks: [
          { title: 'Draft Validation Plan (VP)', type: 'task', qa: true, gxp: true },
          { title: 'System Risk Assessment (GAMP category)', type: 'review', qa: true, gxp: true },
          { title: 'Data integrity requirements (ALCOA+)', type: 'task', qa: true, gxp: true }
        ]
      },
      {
        name: 'Specification (URS / FS / DS)',
        tasks: [
          { title: 'User Requirements Specification (URS)', type: 'task', qa: true, gxp: true },
          { title: 'Functional / Design Specification', type: 'task', qa: true, gxp: true },
          { title: 'Traceability matrix draft', type: 'task', qa: true, gxp: true }
        ]
      },
      {
        name: 'Build & Configuration',
        tasks: [
          { title: 'Install / Configure system in QA environment', type: 'task', gxp: true },
          { title: 'Supplier / Vendor Audit documentation', type: 'review', qa: true, gxp: true }
        ]
      },
      {
        name: 'Qualification (IQ / OQ / PQ)',
        tasks: [
          { title: 'Installation Qualification (IQ)', type: 'test', qa: true, gxp: true },
          { title: 'Operational Qualification (OQ)', type: 'test', qa: true, gxp: true },
          { title: 'Performance Qualification (PQ)', type: 'test', qa: true, gxp: true }
        ]
      },
      {
        name: 'Release & Go-Live',
        tasks: [
          { title: 'Validation Summary Report (VSR)', type: 'approval', qa: true, gxp: true },
          { title: 'QA release approval', type: 'approval', qa: true, gxp: true }
        ]
      },
      {
        name: 'Periodic Review',
        tasks: [{ title: 'Annual periodic review', type: 'review', qa: true, gxp: true }]
      }
    ]
  },

  sop: {
    label: 'Standard Operating Procedure (SOP)',
    description: 'Authoring, review, approval, training and periodic review of SOPs.',
    regulatoryRefs: '21 CFR 211, ICH Q10',
    group: 'Life Sciences',
    phases: [
      { name: 'Authoring', tasks: [{ title: 'Draft SOP', type: 'task', gxp: true }] },
      { name: 'Review', tasks: [
        { title: 'SME review', type: 'review', gxp: true },
        { title: 'QA review', type: 'review', qa: true, gxp: true }
      ] },
      { name: 'Approval', tasks: [
        { title: 'Department head approval', type: 'approval', gxp: true },
        { title: 'QA Head approval & effective date', type: 'approval', qa: true, gxp: true }
      ] },
      { name: 'Training', tasks: [{ title: 'Execute training & record attendance', type: 'task', qa: true, gxp: true }] },
      { name: 'Periodic Review', tasks: [{ title: 'Biennial review', type: 'review', qa: true, gxp: true }] }
    ]
  },

  deviation_capa: {
    label: 'Deviation / CAPA',
    description: 'Deviation investigation and corrective/preventive action lifecycle.',
    regulatoryRefs: 'ICH Q10, 21 CFR 211.192',
    group: 'Life Sciences',
    phases: [
      { name: 'Identification & Containment', tasks: [
        { title: 'Log deviation with initial description', type: 'deviation', qa: true, gxp: true },
        { title: 'Immediate containment actions', type: 'task', qa: true, gxp: true }
      ] },
      { name: 'Investigation & RCA', tasks: [
        { title: 'Classify deviation (minor / major / critical)', type: 'task', qa: true, gxp: true },
        { title: 'Root cause analysis', type: 'review', qa: true, gxp: true },
        { title: 'Impact assessment on product & systems', type: 'review', qa: true, gxp: true }
      ] },
      { name: 'CAPA Definition', tasks: [
        { title: 'Define corrective actions', type: 'capa', qa: true, gxp: true },
        { title: 'Define preventive actions', type: 'capa', qa: true, gxp: true },
        { title: 'Effectiveness check plan', type: 'task', qa: true, gxp: true }
      ] },
      { name: 'Execution & Closure', tasks: [
        { title: 'Execute CAPAs & track evidence', type: 'task', qa: true, gxp: true },
        { title: 'Effectiveness check', type: 'review', qa: true, gxp: true },
        { title: 'QA closure & sign-off', type: 'approval', qa: true, gxp: true }
      ] }
    ]
  },

  change_control: {
    label: 'Change Control',
    description: 'Controlled evaluation, approval and implementation of changes to GxP systems.',
    regulatoryRefs: 'ICH Q10, EU GMP Annex 15',
    group: 'Life Sciences',
    phases: [
      { name: 'Proposal', tasks: [
        { title: 'Submit change request', type: 'task', gxp: true },
        { title: 'Preliminary classification', type: 'review', qa: true, gxp: true }
      ] },
      { name: 'Impact Assessment', tasks: [
        { title: 'Cross-functional impact assessment', type: 'review', qa: true, gxp: true }
      ] },
      { name: 'Approval', tasks: [{ title: 'Change Control Board approval', type: 'approval', qa: true, gxp: true }] },
      { name: 'Implementation', tasks: [
        { title: 'Execute approved actions', type: 'task', gxp: true },
        { title: 'Update documentation & training', type: 'task', qa: true, gxp: true }
      ] },
      { name: 'Verification & Closure', tasks: [{ title: 'Post-implementation verification & QA closure', type: 'approval', qa: true, gxp: true }] }
    ]
  },

  audit: {
    label: 'Audit / Inspection readiness',
    description: 'Internal audit or regulatory inspection preparation, execution and follow-up.',
    regulatoryRefs: '21 CFR 211, EU GMP Ch. 9',
    group: 'Life Sciences',
    phases: [
      { name: 'Preparation', tasks: [
        { title: 'Audit plan & scope', type: 'task', qa: true, gxp: true },
        { title: 'Pre-audit document review', type: 'review', qa: true, gxp: true }
      ] },
      { name: 'Execution', tasks: [
        { title: 'Opening meeting', type: 'task', qa: true },
        { title: 'On-site / remote audit walkthrough', type: 'task', qa: true, gxp: true }
      ] },
      { name: 'Findings & CAPA', tasks: [
        { title: 'Record audit findings', type: 'audit_finding', qa: true, gxp: true },
        { title: 'Assign CAPAs', type: 'capa', qa: true, gxp: true }
      ] },
      { name: 'Follow-up', tasks: [{ title: 'CAPA completion & final report sign-off', type: 'approval', qa: true, gxp: true }] }
    ]
  },

  validation: {
    label: 'Process / Method Validation',
    description: 'Analytical method or manufacturing process validation lifecycle.',
    regulatoryRefs: 'ICH Q2(R1), ICH Q7',
    group: 'Life Sciences',
    phases: [
      { name: 'VMP', tasks: [{ title: 'Draft Validation Master Plan', type: 'task', qa: true, gxp: true }] },
      { name: 'Protocol', tasks: [
        { title: 'Author protocol', type: 'task', qa: true, gxp: true },
        { title: 'QA approve protocol', type: 'approval', qa: true, gxp: true }
      ] },
      { name: 'Execution', tasks: [
        { title: 'Execute validation runs', type: 'test', qa: true, gxp: true },
        { title: 'Record raw data & deviations', type: 'task', qa: true, gxp: true }
      ] },
      { name: 'Report', tasks: [
        { title: 'Validation report', type: 'task', qa: true, gxp: true },
        { title: 'QA approve report', type: 'approval', qa: true, gxp: true }
      ] }
    ]
  },

  data_integrity: {
    label: 'Data Integrity Assessment (ALCOA+)',
    description:
      'Assess ALCOA+ data integrity controls (Attributable, Legible, Contemporaneous, Original, Accurate + Complete, Consistent, Enduring, Available) for a GxP system.',
    regulatoryRefs: 'MHRA DI Guidance 2018, WHO TRS 1033, FDA DI & Compliance Guide',
    group: 'Life Sciences',
    phases: [
      { name: 'Scope & Inventory', tasks: [
        { title: 'Identify GxP data flows and records', type: 'task', qa: true, gxp: true },
        { title: 'Criticality ranking by DI risk', type: 'review', qa: true, gxp: true }
      ] },
      { name: 'Control Assessment', tasks: [
        { title: 'Review audit trail configuration', type: 'data_review', qa: true, gxp: true },
        { title: 'Review user access & segregation of duties', type: 'data_review', qa: true, gxp: true },
        { title: 'Review backup & archival', type: 'data_review', qa: true, gxp: true },
        { title: 'Review time source & clock controls', type: 'data_review', qa: true, gxp: true }
      ] },
      { name: 'Gap Remediation', tasks: [
        { title: 'Log gaps as deviations / CAPAs', type: 'deviation', qa: true, gxp: true },
        { title: 'Execute remediation actions', type: 'task', qa: true, gxp: true }
      ] },
      { name: 'Closure', tasks: [
        { title: 'Data Integrity Assessment Report', type: 'task', qa: true, gxp: true },
        { title: 'QA sign-off', type: 'approval', qa: true, gxp: true }
      ] }
    ]
  },

  pharmacovigilance: {
    label: 'Pharmacovigilance Case Processing',
    description:
      'ICSR (Individual Case Safety Report) intake, triage, narrative writing, coding, QA review and regulatory reporting.',
    regulatoryRefs: 'GVP Module VI, 21 CFR 314.80, ICH E2B(R3)',
    group: 'Life Sciences',
    phases: [
      { name: 'Intake', tasks: [
        { title: 'Receive & log case', type: 'task', gxp: true },
        { title: 'Duplicate check', type: 'data_review', gxp: true }
      ] },
      { name: 'Triage', tasks: [
        { title: 'Seriousness & expectedness assessment', type: 'review', qa: true, gxp: true },
        { title: 'Regulatory clock start', type: 'task', qa: true, gxp: true }
      ] },
      { name: 'Coding & Narrative', tasks: [
        { title: 'MedDRA coding', type: 'task', gxp: true },
        { title: 'Narrative drafting', type: 'task', gxp: true }
      ] },
      { name: 'QC & Medical Review', tasks: [
        { title: 'QC review', type: 'review', qa: true, gxp: true },
        { title: 'Medical review', type: 'review', qa: true, gxp: true }
      ] },
      { name: 'Submission', tasks: [
        { title: 'E2B submission to authorities', type: 'approval', qa: true, gxp: true }
      ] }
    ]
  },

};

export function listLifecycles() {
  return Object.entries(LIFECYCLES).map(([key, v]) => ({
    key: key as LifecycleKey,
    label: v.label,
    description: v.description,
    regulatoryRefs: v.regulatoryRefs,
    group: v.group,
    phaseCount: v.phases.length,
    taskCount: v.phases.reduce((a, p) => a + p.tasks.length, 0)
  }));
}
