// Unit tests for the Flow Signal strip computation.
//
// This is the *fact* path that launches today (Phase 0–3). The inferred /
// learned paths (anomaly baselines, survival model, text classifier, bandit)
// are intentionally not exercised here — they ship behind separate flags
// and have their own deferred test plan.
//
// Per CLAUDE.md and the Flow Signal spec, the visible output must NEVER
// contain the words AI / ML / model / prediction / anomaly / risk-score /
// algorithm / Flow Signal / smart / intelligent. Locked in here so the
// surface stays product-language even as the file evolves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeFlowStrip, type FlowSignalItem } from '@/lib/flow/computeStrip';
import type { FlowConfig } from '@/lib/flow/config';

const FORBIDDEN_WORDS = [
  'AI', 'ML', 'artificial intelligence', 'machine learning', 'model',
  'prediction', 'probability', 'confidence', 'algorithm', 'anomaly',
  'risk score', 'Flow Signal', 'smart', 'intelligent',
];

function assertNoForbiddenLanguage(items: FlowSignalItem[]) {
  for (const it of items) {
    const blob = `${it.headline} ${it.detail || ''} ${it.taskTitle}`;
    for (const w of FORBIDDEN_WORDS) {
      // Word-bounded match — we're checking that these terms don't appear
      // as standalone words in surface copy. Substrings inside ordinary
      // words (e.g. "AI" inside "waiting") are fine.
      const escaped = w.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const re = new RegExp(`\\b${escaped}\\b`, 'i');
      assert.ok(
        !re.test(blob),
        `Forbidden word "${w}" leaked into surface copy: ${blob}`,
      );
    }
  }
}

function makeCfg(overrides: Partial<FlowConfig> = {}): FlowConfig {
  return {
    mode: 'pilot',
    factsEnabled: true,
    anomalyEnabled: false,
    survivalEnabled: false,
    textClassifierEnabled: false,
    banditEnabled: false,
    pilotTeamIds: ['team-pilot'],
    modelCacheTtlSeconds: 600,
    maxIcPromptsPerDay: 3,
    maxLeadItems: 3,
    stillMovingCooldownHours: 24,
    ...overrides,
  };
}

const proj = { _id: 'proj-1', code: 'CC-2025-0001', name: 'Test', isPersonal: false, ownerId: 'lead-1' };
const personalProj = { _id: 'proj-personal', code: 'PRSN-001', name: 'Private', isPersonal: true, ownerId: 'ic-1' };

test('returns null when feature mode is off or shadow', () => {
  const args = {
    viewer: { id: 'ic-1', role: 'employee' },
    tasks: [],
    projects: [proj],
    userNameById: new Map(),
    cfg: makeCfg({ mode: 'off' }),
  };
  assert.equal(computeFlowStrip(args), null);
  assert.equal(computeFlowStrip({ ...args, cfg: makeCfg({ mode: 'shadow' }) }), null);
});

test('returns null when facts flag is disabled', () => {
  const args = {
    viewer: { id: 'ic-1', role: 'employee' },
    tasks: [{ _id: 't1', title: 'X', projectId: 'proj-1', status: 'blocked', assigneeId: 'ic-1' }],
    projects: [proj],
    userNameById: new Map(),
    cfg: makeCfg({ factsEnabled: false }),
  };
  assert.equal(computeFlowStrip(args), null);
});

test('emits a confirmed-waiting item with neutral copy and no forbidden words', () => {
  const out = computeFlowStrip({
    viewer: { id: 'lead-1', role: 'lead' },
    tasks: [{
      _id: 't1', title: 'Cross-functional impact assessment', projectId: 'proj-1',
      status: 'in_progress', assigneeId: 'ic-1',
      flowPendingType: 'approval',
      flowPendingConfirmedAt: new Date(),
      flowPendingConfirmedByUserId: 'ic-1',
      flowResolvedAt: null,
    }],
    projects: [proj],
    userNameById: new Map([['ic-1', 'Abhi']]),
    cfg: makeCfg(),
  });
  assert.ok(out, 'expected a payload');
  assert.equal(out!.mode, 'needs_attention');
  assert.equal(out!.items.length, 1);
  assert.equal(out!.items[0].headline, 'Waiting on approval');
  assert.equal(out!.items[0].confirmed, true);
  assert.equal(out!.items[0].confirmedByName, 'Abhi');
  assertNoForbiddenLanguage(out!.items);
});

test('emits a blocked-status item even without a confirmed pending state', () => {
  const out = computeFlowStrip({
    viewer: { id: 'lead-1', role: 'lead' },
    tasks: [{ _id: 't1', title: 'URS', projectId: 'proj-1', status: 'blocked', assigneeId: 'ic-1' }],
    projects: [proj],
    userNameById: new Map(),
    cfg: makeCfg(),
  });
  assert.ok(out);
  assert.equal(out!.items[0].reasonCodes.includes('blocked'), true);
});

test('returns null when nothing surfaces (silence is the correct state)', () => {
  const out = computeFlowStrip({
    viewer: { id: 'lead-1', role: 'lead' },
    tasks: [{ _id: 't1', title: 'OK task', projectId: 'proj-1', status: 'in_progress', assigneeId: 'ic-1' }],
    projects: [proj],
    userNameById: new Map(),
    cfg: makeCfg(),
  });
  assert.equal(out, null);
});

test('contributor sees only their own assigned tasks', () => {
  const out = computeFlowStrip({
    viewer: { id: 'ic-1', role: 'employee' },
    tasks: [
      { _id: 't1', title: 'Mine',     projectId: 'proj-1', status: 'blocked', assigneeId: 'ic-1' },
      { _id: 't2', title: 'Not mine', projectId: 'proj-1', status: 'blocked', assigneeId: 'ic-other' },
    ],
    projects: [proj],
    userNameById: new Map(),
    cfg: makeCfg(),
  });
  assert.ok(out);
  assert.equal(out!.items.length, 1);
  assert.equal(out!.items[0].taskTitle, 'Mine');
});

test('contributor is capped at 1 item; lead is capped at maxLeadItems (3)', () => {
  const tasks = ['a', 'b', 'c', 'd', 'e'].map((c, i) => ({
    _id: `t${i}`, title: `Task ${c}`, projectId: 'proj-1',
    status: 'blocked', assigneeId: 'ic-1',
  }));
  const ic = computeFlowStrip({
    viewer: { id: 'ic-1', role: 'employee' },
    tasks, projects: [proj], userNameById: new Map(), cfg: makeCfg(),
  });
  assert.equal(ic!.items.length, 1);
  assert.equal(ic!.additionalCount, 4);

  const lead = computeFlowStrip({
    viewer: { id: 'lead-1', role: 'lead' },
    tasks, projects: [proj], userNameById: new Map(), cfg: makeCfg(),
  });
  assert.equal(lead!.items.length, 3);
  assert.equal(lead!.additionalCount, 2);
});

test('private task overlay never leaks to a different viewer', () => {
  const tasks = [{
    _id: 't1', title: 'Private follow-up', projectId: 'proj-1',
    status: 'blocked', assigneeId: 'ic-1',
    privateToUserId: 'ic-1',
  }];
  const owner = computeFlowStrip({
    viewer: { id: 'ic-1', role: 'employee' },
    tasks, projects: [proj], userNameById: new Map(), cfg: makeCfg(),
  });
  assert.equal(owner!.items.length, 1);

  const other = computeFlowStrip({
    viewer: { id: 'lead-1', role: 'lead' },
    tasks, projects: [proj], userNameById: new Map(), cfg: makeCfg(),
  });
  assert.equal(other, null, 'private overlay must NOT surface to anyone else');
});

test('personal projects never surface, even to their owner', () => {
  const tasks = [{
    _id: 't1', title: 'Personal blocker', projectId: 'proj-personal',
    status: 'blocked', assigneeId: 'ic-1',
  }];
  const ownerOfPersonal = computeFlowStrip({
    viewer: { id: 'ic-1', role: 'employee' },
    tasks, projects: [personalProj], userNameById: new Map(), cfg: makeCfg(),
  });
  assert.equal(ownerOfPersonal, null, 'personal projects must never surface in the strip');
});

test('confirmed items rank above bare status-blocked items', () => {
  const tasks = [
    { _id: 't1', title: 'Z status-blocked', projectId: 'proj-1', status: 'blocked', assigneeId: 'ic-1' },
    { _id: 't2', title: 'A confirmed pending', projectId: 'proj-1', status: 'in_progress', assigneeId: 'ic-1',
      flowPendingType: 'decision', flowPendingConfirmedAt: new Date(), flowPendingConfirmedByUserId: 'ic-1' },
  ];
  const out = computeFlowStrip({
    viewer: { id: 'lead-1', role: 'lead' },
    tasks, projects: [proj], userNameById: new Map(), cfg: makeCfg(),
  });
  assert.equal(out!.items[0].taskTitle, 'A confirmed pending');
});

test('a due date alone never creates a signal', () => {
  // Spec explicit: this feature must remain orthogonal to Due & Overdue.
  // A task whose only "issue" is being overdue must not surface here.
  const tasks = [{
    _id: 't1', title: 'Overdue but moving', projectId: 'proj-1',
    status: 'in_progress', assigneeId: 'ic-1',
    // No flowPendingType, no blocked status — just a past due date in
    // some other field. computeFlowStrip should produce nothing.
  }];
  const out = computeFlowStrip({
    viewer: { id: 'lead-1', role: 'lead' },
    tasks, projects: [proj], userNameById: new Map(), cfg: makeCfg(),
  });
  assert.equal(out, null);
});
