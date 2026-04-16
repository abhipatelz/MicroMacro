// Pharma QA lifecycle templates - preloaded phase/task templates for common
// quality processes in pharmaceutical software & quality management.
//
// These templates are what makes this tool specific to pharma QA: when a
// project is created with a given lifecycle, the corresponding phases and
// boilerplate tasks are spun up with sensible defaults (gxp_critical,
// requires_qa_signoff, task_type, etc.).

export const LIFECYCLES = {
  csv: {
    label: 'Computer System Validation (CSV / GAMP 5)',
    description:
      'Validation lifecycle for GxP computerized systems, aligned with GAMP 5 and 21 CFR Part 11 / EU Annex 11.',
    regulatory_refs: '21 CFR Part 11, EU Annex 11, GAMP 5',
    phases: [
      {
        name: 'Planning & Risk Assessment',
        tasks: [
          { title: 'Draft Validation Plan (VP)', type: 'task', qa: true, gxp: true },
          { title: 'System Risk Assessment (GAMP category)', type: 'review', qa: true, gxp: true },
          { title: 'Identify Regulatory & Data Integrity requirements (ALCOA+)', type: 'task', qa: true, gxp: true }
        ]
      },
      {
        name: 'Specification (URS / FS / DS)',
        tasks: [
          { title: 'User Requirements Specification (URS)', type: 'task', qa: true, gxp: true },
          { title: 'Functional Specification (FS)', type: 'task', qa: true, gxp: true },
          { title: 'Design Specification (DS) / Configuration Spec', type: 'task', qa: true, gxp: true },
          { title: 'Requirements Traceability Matrix (RTM) draft', type: 'task', qa: true, gxp: true }
        ]
      },
      {
        name: 'Build & Configuration',
        tasks: [
          { title: 'Install / Configure system in QA environment', type: 'task', qa: false, gxp: true },
          { title: 'Supplier / Vendor Audit documentation', type: 'review', qa: true, gxp: true },
          { title: 'Code review (if bespoke)', type: 'review', qa: true, gxp: true }
        ]
      },
      {
        name: 'Qualification (IQ / OQ / PQ)',
        tasks: [
          { title: 'Installation Qualification (IQ) protocol & execution', type: 'test', qa: true, gxp: true },
          { title: 'Operational Qualification (OQ) protocol & execution', type: 'test', qa: true, gxp: true },
          { title: 'Performance Qualification (PQ) protocol & execution', type: 'test', qa: true, gxp: true },
          { title: 'Deviation management for qualification anomalies', type: 'deviation', qa: true, gxp: true }
        ]
      },
      {
        name: 'Release & Go-Live',
        tasks: [
          { title: 'Complete Traceability Matrix', type: 'task', qa: true, gxp: true },
          { title: 'Validation Summary Report (VSR)', type: 'approval', qa: true, gxp: true },
          { title: 'QA release approval for production use', type: 'approval', qa: true, gxp: true }
        ]
      },
      {
        name: 'Operational Phase & Periodic Review',
        tasks: [
          { title: 'Train end-users & document training records', type: 'task', qa: false, gxp: true },
          { title: 'Periodic Review (annual)', type: 'review', qa: true, gxp: true }
        ]
      }
    ]
  },

  sop: {
    label: 'Standard Operating Procedure (SOP) lifecycle',
    description: 'Authoring, review, approval, training and periodic review of SOPs.',
    regulatory_refs: '21 CFR 211, ICH Q10',
    phases: [
      {
        name: 'Authoring',
        tasks: [
          { title: 'Draft SOP based on template', type: 'task', qa: false, gxp: true },
          { title: 'Cross-reference related SOPs & policies', type: 'task', qa: false, gxp: false }
        ]
      },
      {
        name: 'Review',
        tasks: [
          { title: 'SME review', type: 'review', qa: false, gxp: true },
          { title: 'QA review for compliance', type: 'review', qa: true, gxp: true }
        ]
      },
      {
        name: 'Approval',
        tasks: [
          { title: 'Department head approval', type: 'approval', qa: false, gxp: true },
          { title: 'QA Head approval & effective date assignment', type: 'approval', qa: true, gxp: true }
        ]
      },
      {
        name: 'Training & Rollout',
        tasks: [
          { title: 'Prepare training material', type: 'task', qa: false, gxp: false },
          { title: 'Execute training & record attendance', type: 'task', qa: true, gxp: true }
        ]
      },
      {
        name: 'Periodic Review',
        tasks: [{ title: 'Biennial SOP review', type: 'review', qa: true, gxp: true }]
      }
    ]
  },

  deviation_capa: {
    label: 'Deviation / CAPA',
    description: 'Deviation investigation and Corrective & Preventive Action lifecycle.',
    regulatory_refs: 'ICH Q10, 21 CFR 211.192',
    phases: [
      {
        name: 'Identification & Containment',
        tasks: [
          { title: 'Log deviation with initial description', type: 'deviation', qa: true, gxp: true },
          { title: 'Immediate containment actions', type: 'task', qa: true, gxp: true }
        ]
      },
      {
        name: 'Investigation & Root Cause Analysis',
        tasks: [
          { title: 'Assign investigator & classification (minor / major / critical)', type: 'task', qa: true, gxp: true },
          { title: 'Root cause analysis (5-Why / Fishbone)', type: 'review', qa: true, gxp: true },
          { title: 'Impact assessment on product, batches & systems', type: 'review', qa: true, gxp: true }
        ]
      },
      {
        name: 'CAPA Definition',
        tasks: [
          { title: 'Define corrective actions', type: 'capa', qa: true, gxp: true },
          { title: 'Define preventive actions', type: 'capa', qa: true, gxp: true },
          { title: 'Effectiveness check plan', type: 'task', qa: true, gxp: true }
        ]
      },
      {
        name: 'Execution & Closure',
        tasks: [
          { title: 'Execute CAPAs & track evidence', type: 'task', qa: true, gxp: true },
          { title: 'Effectiveness check', type: 'review', qa: true, gxp: true },
          { title: 'QA closure & sign-off', type: 'approval', qa: true, gxp: true }
        ]
      }
    ]
  },

  change_control: {
    label: 'Change Control',
    description: 'Controlled evaluation, approval and implementation of changes to GxP systems / processes.',
    regulatory_refs: 'ICH Q10, EU GMP Annex 15',
    phases: [
      {
        name: 'Proposal',
        tasks: [
          { title: 'Submit change request with justification', type: 'task', qa: false, gxp: true },
          { title: 'Preliminary classification (minor / major)', type: 'review', qa: true, gxp: true }
        ]
      },
      {
        name: 'Impact Assessment',
        tasks: [
          { title: 'Cross-functional impact assessment (QA, Prod, IT, Reg)', type: 'review', qa: true, gxp: true },
          { title: 'Validation / regulatory impact', type: 'review', qa: true, gxp: true }
        ]
      },
      {
        name: 'Approval',
        tasks: [{ title: 'Change Control Board approval', type: 'approval', qa: true, gxp: true }]
      },
      {
        name: 'Implementation',
        tasks: [
          { title: 'Execute approved actions', type: 'task', qa: false, gxp: true },
          { title: 'Update documentation & training', type: 'task', qa: true, gxp: true }
        ]
      },
      {
        name: 'Verification & Closure',
        tasks: [
          { title: 'Post-implementation verification', type: 'review', qa: true, gxp: true },
          { title: 'QA closure', type: 'approval', qa: true, gxp: true }
        ]
      }
    ]
  },

  audit: {
    label: 'Audit / Inspection readiness',
    description: 'Internal audit or regulatory inspection preparation, execution and follow-up.',
    regulatory_refs: '21 CFR 211, EU GMP Ch. 9',
    phases: [
      {
        name: 'Preparation',
        tasks: [
          { title: 'Audit plan & scope', type: 'task', qa: true, gxp: true },
          { title: 'Pre-audit document review', type: 'review', qa: true, gxp: true }
        ]
      },
      {
        name: 'Execution',
        tasks: [
          { title: 'Opening meeting', type: 'task', qa: true, gxp: false },
          { title: 'On-site / remote audit walkthrough', type: 'task', qa: true, gxp: true },
          { title: 'Closing meeting & preliminary findings', type: 'task', qa: true, gxp: true }
        ]
      },
      {
        name: 'Findings & CAPA',
        tasks: [
          { title: 'Record audit findings', type: 'audit_finding', qa: true, gxp: true },
          { title: 'Assign CAPAs to findings', type: 'capa', qa: true, gxp: true }
        ]
      },
      {
        name: 'Follow-up',
        tasks: [
          { title: 'Track CAPA completion', type: 'task', qa: true, gxp: true },
          { title: 'Final audit report & QA sign-off', type: 'approval', qa: true, gxp: true }
        ]
      }
    ]
  },

  validation: {
    label: 'Process / Method Validation',
    description: 'Analytical method or manufacturing process validation lifecycle.',
    regulatory_refs: 'ICH Q2(R1), ICH Q7',
    phases: [
      {
        name: 'Validation Master Plan',
        tasks: [{ title: 'Draft Validation Master Plan', type: 'task', qa: true, gxp: true }]
      },
      {
        name: 'Protocol',
        tasks: [
          { title: 'Author validation protocol', type: 'task', qa: true, gxp: true },
          { title: 'QA approve protocol', type: 'approval', qa: true, gxp: true }
        ]
      },
      {
        name: 'Execution',
        tasks: [
          { title: 'Execute validation runs', type: 'test', qa: true, gxp: true },
          { title: 'Record raw data & deviations', type: 'task', qa: true, gxp: true }
        ]
      },
      {
        name: 'Report',
        tasks: [
          { title: 'Validation report', type: 'task', qa: true, gxp: true },
          { title: 'QA approve report', type: 'approval', qa: true, gxp: true }
        ]
      }
    ]
  },

  generic: {
    label: 'Generic project',
    description: 'Generic project without a pharma-specific lifecycle.',
    regulatory_refs: '',
    phases: [
      { name: 'Planning', tasks: [{ title: 'Kick-off', type: 'task', qa: false, gxp: false }] },
      { name: 'Execution', tasks: [{ title: 'Work item', type: 'task', qa: false, gxp: false }] },
      { name: 'Closure', tasks: [{ title: 'Wrap-up', type: 'task', qa: false, gxp: false }] }
    ]
  }
};

export function listLifecycles() {
  return Object.entries(LIFECYCLES).map(([key, v]) => ({
    key,
    label: v.label,
    description: v.description,
    regulatory_refs: v.regulatory_refs,
    phase_count: v.phases.length,
    task_count: v.phases.reduce((a, p) => a + p.tasks.length, 0)
  }));
}
