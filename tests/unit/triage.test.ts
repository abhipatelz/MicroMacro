// Unit tests for the deterministic QA Triage Assistant.
//
// Per CLAUDE.md, this scoring path (severity / severityScore / category /
// suggestedCapa) MUST remain rule-based and locally traceable — never an LLM
// call. These tests lock in that contract: every assertion below can be
// justified by pointing at a line in src/lib/ai/triage.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyCategory,
  scoreSeverity,
  severityFromScore,
  tokenize,
  bagOfWords,
  cosine,
  findSimilar,
  runTriage,
} from '@/lib/ai/triage';

test('severityFromScore honours the documented thresholds', () => {
  assert.equal(severityFromScore(5), 'critical');
  assert.equal(severityFromScore(4.9), 'major');
  assert.equal(severityFromScore(2), 'major');
  assert.equal(severityFromScore(1.9), 'minor');
  assert.equal(severityFromScore(0), 'minor');
  assert.equal(severityFromScore(-5), 'minor');
});

test('patient-safety language drives a critical score', () => {
  const { score, hits } = scoreSeverity('Potential patient safety impact, batch released to market');
  assert.ok(score >= 5, `expected critical-range score, got ${score}`);
  assert.equal(severityFromScore(score), 'critical');
  assert.ok(hits.some((h) => /patient safety/i.test(h.reason)));
});

test('mitigating language pulls the score down to minor', () => {
  const { score } = scoreSeverity('Minor typo in a single record in the sandbox test environment');
  assert.ok(score < 2, `expected minor-range score, got ${score}`);
  assert.equal(severityFromScore(score), 'minor');
});

test('category classification picks the strongest keyword match', () => {
  const cat = classifyCategory('Audit trail disabled, shared login used, data integrity gap');
  assert.equal(cat.key, 'data_integrity');
});

test('text with no keywords falls back to the general category', () => {
  const cat = classifyCategory('Please reschedule the cafeteria menu meeting');
  assert.equal(cat.key, 'general');
});

test('tokenize lowercases, strips punctuation, drops stopwords/short tokens, keeps domain hyphens/plus', () => {
  // Hyphens and '+' are intentionally preserved so domain terms like
  // "audit-trail" and "ALCOA+" survive as single, meaningful tokens.
  assert.deepEqual(tokenize('The Audit-Trail was DISABLED!'), ['audit-trail', 'disabled']);
  assert.deepEqual(tokenize('ALCOA+ data integrity'), ['alcoa+', 'data', 'integrity']);
});

test('cosine similarity: identical vectors = 1, disjoint = 0', () => {
  const a = bagOfWords(tokenize('deviation in chromatography injection sequence'));
  const b = bagOfWords(tokenize('deviation in chromatography injection sequence'));
  assert.ok(Math.abs(cosine(a, b) - 1) < 1e-9);
  const c = bagOfWords(tokenize('completely unrelated cafeteria lunch menu'));
  assert.equal(cosine(a, c), 0);
});

test('findSimilar ranks the closest past task first and filters weak matches', () => {
  const corpus = [
    { _id: '1', title: 'HPLC chromatography injection sequence deviation', description: '' },
    { _id: '2', title: 'Cafeteria menu update', description: 'lunch options' },
  ];
  const hits = findSimilar('chromatography injection sequence deviation on the HPLC', corpus);
  assert.ok(hits.length >= 1);
  assert.equal(String(hits[0].task._id), '1');
  assert.ok(!hits.some((h) => String(h.task._id) === '2'));
});

test('runTriage returns a fully traceable, reproducible result', () => {
  const r1 = runTriage(
    'Shared login on LIMS',
    'Generic user account used, audit trail gap, patient safety risk, batch released to market',
    [],
  );
  const r2 = runTriage(
    'Shared login on LIMS',
    'Generic user account used, audit trail gap, patient safety risk, batch released to market',
    [],
  );
  // Deterministic: same input -> same classification (ignoring the timestamp).
  assert.equal(r1.severity, r2.severity);
  assert.equal(r1.severityScore, r2.severityScore);
  assert.equal(r1.category, r2.category);
  assert.equal(r1.severity, 'critical');
  assert.equal(r1.category, 'data_integrity');
  // Rationale must cite the signals that drove the score (auditability).
  assert.ok(r1.rationale.length > 0);
  assert.ok(r1.suggestedCapa.length > 0 && r1.suggestedCapa.length <= 5);
});
