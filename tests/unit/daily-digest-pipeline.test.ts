/**
 * Pipeline tests for the daily digest SEND path — the layer the pure helper
 * tests (daily-digest.test.ts) deliberately do not cover.
 *
 * What's real here: `buildAndSendDailyDigests` orchestration, bucketing,
 * section gating, email rendering, and `sendEmail` doing an actual HTTP POST
 * (to a local mock of Brevo's endpoint via BREVO_API_URL), so we assert on the
 * exact payloads that would have left the building.
 *
 * What's stubbed: only the MongoDB boundary. The mongoose connection cache is
 * pre-seeded so connectDB() is a no-op, and the four model statics the digest
 * uses are replaced with an honest in-memory evaluator of the exact query
 * shapes the module issues ($ne / $in / $or+$lt — including Mongo's rule that
 * a missing/null field never satisfies $lt). No network, no mongod binary.
 */

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

const DAY = 24 * 60 * 60 * 1000;

/* ── Mock Brevo ──────────────────────────────────────────────────────────── */

interface CapturedMail {
  apiKey: string | null;
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text?: string;
}
const inbox: CapturedMail[] = [];
let mockBrevo: http.Server;

/* ── In-memory data + a tiny evaluator for the query shapes digest.ts uses ── */

// Valid 24-hex ids — test mode round-trips them through mongoose ObjectId.
const ASHA = 'aaaaaaaaaaaaaaaaaaaaaaaa'; // opted in, notifyEmail set
const BOLA = 'bbbbbbbbbbbbbbbbbbbbbbbb'; // opted OUT
const CHIP = 'cccccccccccccccccccccccc'; // opted in, no deliverable address
const PROJ = 'dddddddddddddddddddddddd';

const now = new Date();

const users = [
  {
    _id: ASHA,
    name: 'Asha Tester',
    email: 'asha.login@pragati.local',
    notifyEmail: 'asha@example.com',
    active: true,
    notifDailyDigest: true,
  },
  { _id: BOLA, name: 'Bola OptedOut', email: 'bola@example.com', active: true, notifDailyDigest: false },
  { _id: CHIP, name: 'Chip NoEmail', email: 'chip@pragati.local', active: true, notifDailyDigest: true },
];

const tasks = [
  // Overdue / due-today / ccTcd-wins — all must appear.
  {
    _id: 't1',
    title: 'Close out deviation DEV-101',
    priority: 'high',
    status: 'todo',
    assigneeId: ASHA,
    projectId: PROJ,
    dueDate: new Date(now.getTime() - 2 * DAY),
  },
  {
    _id: 't2',
    title: 'Approve URS revision',
    priority: 'critical',
    status: 'todo',
    assigneeId: ASHA,
    projectId: PROJ,
    dueDate: now,
  },
  {
    _id: 't3',
    title: 'Deploy bot to VAL',
    status: 'in_progress',
    assigneeId: ASHA,
    projectId: PROJ,
    dueDate: new Date(now.getTime() + 10 * DAY),
    ccTcd: now,
  },
  // Excluded: done / no due date / beyond the look-ahead (until raised).
  { _id: 't4', title: 'Draft FRAP', status: 'done', assigneeId: ASHA, projectId: PROJ, dueDate: now },
  { _id: 't5', title: 'Someday refactor', status: 'todo', assigneeId: ASHA, projectId: PROJ },
  {
    _id: 't6',
    title: 'QA sign-off rehearsal',
    status: 'todo',
    assigneeId: ASHA,
    projectId: PROJ,
    dueDate: new Date(now.getTime() + 3 * DAY),
  },
];

const projects = [{ _id: PROJ, name: 'MES Upgrade' }];

// The singleton settings doc, reset before each test (schema defaults).
let settings: Record<string, any>;

/** Mongo-faithful evaluation of the filter shapes digest.ts issues. */
function matches(doc: any, filter: Record<string, any>): boolean {
  for (const [key, cond] of Object.entries(filter)) {
    if (key === '$or') {
      if (!(cond as any[]).some((c) => matches(doc, c))) return false;
      continue;
    }
    const v = doc[key];
    const isOperatorObject =
      cond !== null &&
      typeof cond === 'object' &&
      !(cond instanceof Date) &&
      Object.keys(cond).some((k) => k.startsWith('$'));
    if (isOperatorObject) {
      if ('$ne' in cond && v === cond.$ne) return false;
      if ('$in' in cond && !cond.$in.some((x: any) => String(x) === String(v))) return false;
      // Mongo: a missing/null field never satisfies a $lt/$gte comparison.
      if ('$lt' in cond && (v == null || !(new Date(v) < cond.$lt))) return false;
      if ('$gte' in cond && (v == null || !(new Date(v) >= cond.$gte))) return false;
    } else if (String(v) !== String(cond)) {
      // Plain equality — covers strings and ObjectId values alike.
      return false;
    }
  }
  return true;
}

/** Mongoose-style chainable query stub ending in .lean(). */
function chain(result: () => any[]) {
  const q = {
    select: () => q,
    limit: () => q,
    sort: () => q,
    lean: async () => result(),
  };
  return q;
}

let digest: typeof import('../../src/lib/digest');

before(async () => {
  // Mock Brevo — records every send and answers like the real API.
  mockBrevo = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const parsed = JSON.parse(body || '{}');
      inbox.push({
        apiKey: (req.headers['api-key'] as string) || null,
        to: parsed?.to?.[0]?.email || '',
        toName: parsed?.to?.[0]?.name,
        subject: parsed?.subject || '',
        html: parsed?.htmlContent || '',
        text: parsed?.textContent,
      });
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ messageId: `mock-${inbox.length}` }));
    });
  });
  await new Promise<void>((resolve) => mockBrevo.listen(0, '127.0.0.1', resolve));
  const port = (mockBrevo.address() as AddressInfo).port;

  // Environment must be in place BEFORE the app modules load (hence the
  // dynamic imports). Pre-seeding the connection cache makes connectDB a
  // no-op, so no MongoDB is ever contacted.
  process.env.BREVO_API_URL = `http://127.0.0.1:${port}`;
  process.env.BREVO_API_KEY = 'test-api-key';
  process.env.BREVO_SENDER_EMAIL = 'digest@pragati.test';
  process.env.APP_URL = 'https://pragati.example';
  (global as any).__mongooseCache = { conn: {}, promise: Promise.resolve({}) };

  digest = await import('../../src/lib/digest');
  const { User } = await import('../../src/models/User');
  const { Task } = await import('../../src/models/Task');
  const { Project } = await import('../../src/models/Project');
  const { DigestSetting } = await import('../../src/models/DigestSetting');

  (User as any).find = (f: any) => chain(() => users.filter((u) => matches(u, f)));
  (Task as any).find = (f: any) => chain(() => tasks.filter((t) => matches(t, f)));
  (Project as any).find = (f: any) => chain(() => projects.filter((p) => matches(p, f)));
  (DigestSetting as any).findByIdAndUpdate = () => ({ lean: async () => settings });
});

after(async () => {
  await new Promise<void>((resolve) => mockBrevo.close(() => resolve()));
});

beforeEach(() => {
  inbox.length = 0;
  settings = {
    _id: 'global',
    enabled: true,
    dueToday: true,
    overdue: true,
    dueSoonDays: 0,
    projectUpdates: false,
    sendWhenEmpty: false,
    introNote: '',
  };
});

describe('buildAndSendDailyDigests → Brevo (end to end over HTTP)', () => {
  it('sends one digest per opted-in deliverable user with the right content', async () => {
    const summary = await digest.buildAndSendDailyDigests({ now });

    assert.equal(summary.mailerConfigured, true);
    assert.equal(summary.considered, 2, 'asha + chip match the recipient filter; bola opted out');
    assert.equal(summary.sent, 1);
    assert.equal(summary.skippedNoEmail, 1, 'chip has no deliverable address');
    assert.equal(summary.failed, 0);

    assert.equal(inbox.length, 1);
    const mail = inbox[0];
    assert.equal(mail.apiKey, 'test-api-key', 'API key travels in the api-key header');
    assert.equal(mail.to, 'asha@example.com', 'notifyEmail wins over the placeholder login');
    assert.equal(mail.toName, 'Asha Tester');
    assert.equal(mail.subject, 'Pragati — 2 due today · 1 overdue');

    // Included tasks…
    assert.match(mail.html, /Approve URS revision/);
    assert.match(mail.html, /Deploy bot to VAL/, 'ccTcd wins over a far-future dueDate');
    assert.match(mail.html, /Close out deviation DEV-101/);
    assert.match(mail.html, /MES Upgrade/, 'project name is resolved');
    // …and excluded ones.
    assert.doesNotMatch(mail.html, /Draft FRAP/, 'done tasks never appear');
    assert.doesNotMatch(mail.html, /Someday refactor/, 'tasks without a due date never appear');
    assert.doesNotMatch(mail.html, /QA sign-off rehearsal/, 'dueSoonDays=0 hides the look-ahead');

    assert.match(mail.html, /href="https:\/\/pragati\.example\/tasks\/t2"/, 'deep links use APP_URL');
    assert.match(mail.text || '', /Open My Day: https:\/\/pragati\.example\/my-day/);
  });

  it('includes the look-ahead section when dueSoonDays is raised', async () => {
    settings.dueSoonDays = 7;
    const summary = await digest.buildAndSendDailyDigests({ now });

    assert.equal(summary.sent, 1);
    assert.equal(inbox[0].subject, 'Pragati — 2 due today · 1 overdue · 1 due soon');
    assert.match(inbox[0].html, /QA sign-off rehearsal/);
  });

  it('honours the section toggles', async () => {
    settings.overdue = false;
    const summary = await digest.buildAndSendDailyDigests({ now });

    assert.equal(summary.sent, 1);
    assert.equal(inbox[0].subject, 'Pragati — 2 due today');
    assert.doesNotMatch(inbox[0].html, /Close out deviation DEV-101/);
  });

  it('goes quiet when the master switch is off', async () => {
    settings.enabled = false;
    const summary = await digest.buildAndSendDailyDigests({ now });

    assert.equal(summary.disabled, true);
    assert.equal(summary.sent, 0);
    assert.equal(inbox.length, 0, 'no email leaves when disabled');
  });

  it('test mode forces a send to the caller, ignoring opt-out and the master switch', async () => {
    settings.enabled = false; // even with the workspace switch off…
    const summary = await digest.buildAndSendDailyDigests({ now, test: true, onlyUserId: BOLA });

    assert.equal(summary.sent, 1);
    assert.equal(inbox.length, 1);
    assert.equal(inbox[0].to, 'bola@example.com');
    assert.match(inbox[0].subject, /^\[Test\] Pragati — /);
    assert.match(inbox[0].html, /all clear|nothing due/i, 'bola has no tasks — empty-state body');
  });

  it('reports a failed send when the provider errors, without throwing', async () => {
    const prev = process.env.BREVO_API_URL;
    process.env.BREVO_API_URL = 'http://127.0.0.1:9'; // nobody listens here
    try {
      const summary = await digest.buildAndSendDailyDigests({ now });
      assert.equal(summary.sent, 0);
      assert.equal(summary.failed, 1);
    } finally {
      process.env.BREVO_API_URL = prev;
    }
  });

  it('is a transparent no-op when Brevo is not configured', async () => {
    const prevKey = process.env.BREVO_API_KEY;
    delete process.env.BREVO_API_KEY;
    try {
      const summary = await digest.buildAndSendDailyDigests({ now });
      assert.equal(summary.mailerConfigured, false);
      assert.equal(summary.sent, 0);
      assert.equal(summary.failed, 1, 'skipped sends surface as failures in the summary');
      assert.equal(inbox.length, 0);
    } finally {
      process.env.BREVO_API_KEY = prevKey;
    }
  });
});
