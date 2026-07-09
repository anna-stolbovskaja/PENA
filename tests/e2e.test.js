// PEÑA — End-to-End Integration Tests
// Tests full workflows: member onboarding → contribute → propose → approve → execute

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENT_TYPES,
  createEvent,
  initialState,
  applyEvent,
  rebuildState,
  resetAppliedIds,
  isApproved,
  getCategorySummary,
  getMemberContributions,
  escapeHtml,
  sanitizeAmount,
  sanitizeText,
  eventHash,
  verifyEventIntegrity,
} from '../src/lib/ledger.js';
import { QVAC, categorizeExpense, queryLedger } from '../src/lib/qvac.js';

// ═══════════════════════════════════════════════════════════════
// E2E: Full Treasury Lifecycle
// ═══════════════════════════════════════════════════════════════

test('E2E: full treasury lifecycle — join, contribute, propose, approve, execute', () => {
  resetAppliedIds();
  const events = [];

  // 1. Members join
  const m1 = createEvent(EVENT_TYPES.MEMBER_JOIN, { id: 'm1', name: 'Carlos', role: 'founder', walletAddr: '0x1' });
  const m2 = createEvent(EVENT_TYPES.MEMBER_JOIN, { id: 'm2', name: 'Ana', role: 'approver', walletAddr: '0x2' });
  const m3 = createEvent(EVENT_TYPES.MEMBER_JOIN, { id: 'm3', name: 'Diego', role: 'approver', walletAddr: '0x3' });
  events.push(m1, m2, m3);

  // 2. Contributions
  const c1 = createEvent(EVENT_TYPES.CONTRIBUTION, { memberId: 'm1', amount: 500, txHash: '0xtx1' });
  const c2 = createEvent(EVENT_TYPES.CONTRIBUTION, { memberId: 'm2', amount: 300, txHash: '0xtx2' });
  const c3 = createEvent(EVENT_TYPES.CONTRIBUTION, { memberId: 'm3', amount: 200, txHash: '0xtx3' });
  events.push(c1, c2, c3);

  // 3. Create proposal
  const p1 = createEvent(EVENT_TYPES.PROPOSAL_CREATE, {
    id: 'p1', payee: 'Bus Company', amount: 450, currency: 'USDt',
    purpose: 'Bus rental for away match', category: 'Transport',
    createdBy: 'm1',
  });
  events.push(p1);

  // 4. Approve (2 of 3 = M-of-N threshold met)
  const a1 = createEvent(EVENT_TYPES.PROPOSAL_APPROVE, { proposalId: 'p1', memberId: 'm1', sig: '0xsig1' });
  const a2 = createEvent(EVENT_TYPES.PROPOSAL_APPROVE, { proposalId: 'p1', memberId: 'm2', sig: '0xsig2' });
  events.push(a1, a2);

  // 5. Execute
  const ex = createEvent(EVENT_TYPES.PROPOSAL_EXECUTE, { proposalId: 'p1', txHash: '0xexec1' });
  events.push(ex);

  // Rebuild and verify
  const state = rebuildState(events);

  assert.equal(state.members.length, 3);
  assert.equal(state.contributions.length, 3);
  assert.equal(state.balance, 550); // 1000 - 450 = 550
  assert.equal(state.proposals.length, 1);
  assert.equal(state.proposals[0].status, 'executed');
  assert.equal(state.proposals[0].approvals.length, 2);
  assert.equal(state.executions.length, 1);
});

test('E2E: proposal blocked by insufficient balance', () => {
  resetAppliedIds();
  const events = [
    createEvent(EVENT_TYPES.MEMBER_JOIN, { id: 'm1', name: 'X', role: 'founder' }),
    createEvent(EVENT_TYPES.CONTRIBUTION, { memberId: 'm1', amount: 100 }),
    createEvent(EVENT_TYPES.PROPOSAL_CREATE, { id: 'p1', payee: 'Y', amount: 999, purpose: 'big spend', category: 'Other' }),
    createEvent(EVENT_TYPES.PROPOSAL_EXECUTE, { proposalId: 'p1', txHash: '0x' }),
  ];
  const state = rebuildState(events);
  assert.equal(state.balance, 100); // execution blocked — balance unchanged
  assert.equal(state.proposals[0].status, 'pending'); // still pending
});

test('E2E: tampered events rejected during rebuild', () => {
  resetAppliedIds();
  const good = createEvent(EVENT_TYPES.CONTRIBUTION, { memberId: 'm1', amount: 100 });
  const tampered = createEvent(EVENT_TYPES.CONTRIBUTION, { memberId: 'm1', amount: 200 });
  tampered.data.amount = 999999; // tamper after hash

  const state = initialState();
  applyEvent(state, createEvent(EVENT_TYPES.MEMBER_JOIN, { id: 'm1', name: 'A' }));
  applyEvent(state, good);
  applyEvent(state, tampered); // should be rejected

  assert.equal(state.contributions.length, 1); // only 1 valid
  assert.equal(state.balance, 100);
});

test('E2E: replay protection across rebuild', () => {
  resetAppliedIds();
  const join = createEvent(EVENT_TYPES.MEMBER_JOIN, { id: 'm1', name: 'A' });
  const contrib = createEvent(EVENT_TYPES.CONTRIBUTION, { memberId: 'm1', amount: 500 });

  const state = initialState();
  applyEvent(state, join);
  applyEvent(state, contrib);
  applyEvent(state, contrib); // replay — should be ignored
  applyEvent(state, contrib); // replay again

  assert.equal(state.contributions.length, 1);
  assert.equal(state.balance, 500);
});

test('E2E: multiple proposals with different statuses', () => {
  resetAppliedIds();
  const events = [
    createEvent(EVENT_TYPES.MEMBER_JOIN, { id: 'm1', name: 'A', role: 'founder' }),
    createEvent(EVENT_TYPES.MEMBER_JOIN, { id: 'm2', name: 'B', role: 'approver' }),
    createEvent(EVENT_TYPES.CONTRIBUTION, { memberId: 'm1', amount: 2000 }),
    // Proposal 1: approved and executed
    createEvent(EVENT_TYPES.PROPOSAL_CREATE, { id: 'p1', payee: 'X', amount: 300, purpose: 'x', category: 'Transport' }),
    createEvent(EVENT_TYPES.PROPOSAL_APPROVE, { proposalId: 'p1', memberId: 'm1', sig: '0x1' }),
    createEvent(EVENT_TYPES.PROPOSAL_APPROVE, { proposalId: 'p1', memberId: 'm2', sig: '0x2' }),
    createEvent(EVENT_TYPES.PROPOSAL_EXECUTE, { proposalId: 'p1', txHash: '0xex1' }),
    // Proposal 2: pending (1 approval only)
    createEvent(EVENT_TYPES.PROPOSAL_CREATE, { id: 'p2', payee: 'Y', amount: 500, purpose: 'y', category: 'Tifo' }),
    createEvent(EVENT_TYPES.PROPOSAL_APPROVE, { proposalId: 'p2', memberId: 'm1', sig: '0x3' }),
    // Proposal 3: no approvals
    createEvent(EVENT_TYPES.PROPOSAL_CREATE, { id: 'p3', payee: 'Z', amount: 200, purpose: 'z', category: 'Equipment' }),
  ];

  const state = rebuildState(events);
  assert.equal(state.proposals.length, 3);
  assert.equal(state.proposals[0].status, 'executed');
  assert.equal(state.proposals[1].status, 'pending');
  assert.equal(state.proposals[1].approvals.length, 1);
  assert.equal(state.proposals[2].status, 'pending');
  assert.equal(state.proposals[2].approvals.length, 0);
  assert.equal(state.balance, 1700); // 2000 - 300 = 1700
});

// ═══════════════════════════════════════════════════════════════
// E2E: Event Integrity
// ═══════════════════════════════════════════════════════════════

test('E2E: all events have valid hashes after creation', () => {
  resetAppliedIds();
  const events = [
    createEvent(EVENT_TYPES.MEMBER_JOIN, { id: 'm1', name: 'Test' }),
    createEvent(EVENT_TYPES.CONTRIBUTION, { memberId: 'm1', amount: 100 }),
    createEvent(EVENT_TYPES.PROPOSAL_CREATE, { id: 'p1', payee: 'X', amount: 50, purpose: 'test' }),
    createEvent(EVENT_TYPES.PROPOSAL_APPROVE, { proposalId: 'p1', memberId: 'm1', sig: '0x' }),
    createEvent(EVENT_TYPES.PROPOSAL_EXECUTE, { proposalId: 'p1', txHash: '0x' }),
  ];

  for (const ev of events) {
    assert.ok(ev.hash, `Event ${ev.type} should have a hash`);
    assert.ok(verifyEventIntegrity(ev), `Event ${ev.type} hash should verify`);
  }
});

test('E2E: hash changes when any field is tampered', () => {
  const ev = createEvent(EVENT_TYPES.CONTRIBUTION, { memberId: 'm1', amount: 100 });
  const originalHash = ev.hash;

  // Tamper different fields
  const ev2 = { ...ev, data: { ...ev.data, amount: 999 } };
  assert.notEqual(eventHash(ev2), originalHash);

  const ev3 = { ...ev, data: { ...ev.data, memberId: 'm999' } };
  assert.notEqual(eventHash(ev3), originalHash);
});

// ═══════════════════════════════════════════════════════════════
// E2E: QVAC SDK
// ═══════════════════════════════════════════════════════════════

test('QVAC SDK: categorize returns valid categories', () => {
  assert.equal(categorizeExpense('bus rental for team'), 'Transporte');
  assert.equal(categorizeExpense('flags and banners tifo'), 'Tifo');
  assert.equal(categorizeExpense('restaurante comida'), 'Comida');
  assert.equal(categorizeExpense('match tickets entrada'), 'Entradas');
  assert.equal(categorizeExpense('random stuff'), 'Otros');
});

test('QVAC SDK: batch categorize works', () => {
  const results = QVAC.categorizeBatch(['bus for match', 'tifo banners', 'supermercado compra']);
  assert.equal(results.length, 3);
  assert.equal(results[0].category, 'Transporte');
  assert.equal(results[1].category, 'Tifo');
  assert.equal(results[2].category, 'Comida');
});

test('QVAC SDK: status reports capabilities', () => {
  const status = QVAC.status();
  assert.equal(status.version, '1.0.0');
  assert.ok(status.capabilities.includes('ocr'));
  assert.ok(status.capabilities.includes('nlQuery'));
  assert.ok(status.capabilities.includes('categorization'));
});

test('QVAC SDK: extractFromText parses receipt data', () => {
  const result = QVAC.extractFromText('Supermercado ABC\nFecha: 15/06/2026\nTotal: $125.50\nPAN INTEGRAL\nJAMON\n');
  assert.ok(result.payee.length > 0);
  assert.equal(result.amount, 125.5);
  assert.equal(result.category, 'Comida');
});

test('QVAC SDK: query returns structured answers', () => {
  resetAppliedIds();
  const state = rebuildState([
    createEvent(EVENT_TYPES.MEMBER_JOIN, { id: 'm1', name: 'Carlos' }),
    createEvent(EVENT_TYPES.CONTRIBUTION, { memberId: 'm1', amount: 500 }),
  ]);
  const result = QVAC.query(state, 'saldo');
  assert.ok(result.includes('500'));
});

test('QVAC SDK: query handles empty state', () => {
  const state = initialState();
  const result = QVAC.query(state, 'saldo');
  assert.ok(result.includes('0'));
});

// ═══════════════════════════════════════════════════════════════
// E2E: Data Integrity Under Stress
// ═══════════════════════════════════════════════════════════════

test('E2E: rebuild handles 100 events correctly', () => {
  resetAppliedIds();
  const events = [];
  events.push(createEvent(EVENT_TYPES.MEMBER_JOIN, { id: 'm1', name: 'A', role: 'founder' }));

  for (let i = 0; i < 50; i++) {
    events.push(createEvent(EVENT_TYPES.CONTRIBUTION, { memberId: 'm1', amount: 10, txHash: '0x' + i }));
  }

  for (let i = 0; i < 10; i++) {
    events.push(createEvent(EVENT_TYPES.PROPOSAL_CREATE, { id: `p${i}`, payee: `V${i}`, amount: 5, purpose: `test ${i}`, category: 'Other' }));
  }

  const state = rebuildState(events);
  assert.equal(state.members.length, 1);
  assert.equal(state.contributions.length, 50);
  assert.equal(state.balance, 500); // 50 * 10
  assert.equal(state.proposals.length, 10);
});

test('E2E: category summary tracks only executed proposals', () => {
  resetAppliedIds();
  const events = [
    createEvent(EVENT_TYPES.MEMBER_JOIN, { id: 'm1', name: 'A' }),
    createEvent(EVENT_TYPES.CONTRIBUTION, { memberId: 'm1', amount: 5000 }),
    createEvent(EVENT_TYPES.PROPOSAL_CREATE, { id: 'p1', payee: 'X', amount: 100, purpose: 'x', category: 'Transport' }),
    createEvent(EVENT_TYPES.PROPOSAL_EXECUTE, { proposalId: 'p1', txHash: '0x1' }),
    createEvent(EVENT_TYPES.PROPOSAL_CREATE, { id: 'p2', payee: 'Y', amount: 200, purpose: 'y', category: 'Transport' }),
    // p2 NOT executed — should not appear in category summary
  ];
  const state = rebuildState(events);
  const cats = getCategorySummary(state);
  assert.equal(cats['Transport'], 100); // only p1
});

test('E2E: getMemberContributions maps by name', () => {
  resetAppliedIds();
  const events = [
    createEvent(EVENT_TYPES.MEMBER_JOIN, { id: 'm1', name: 'Alice' }),
    createEvent(EVENT_TYPES.MEMBER_JOIN, { id: 'm2', name: 'Bob' }),
    createEvent(EVENT_TYPES.CONTRIBUTION, { memberId: 'm1', amount: 100 }),
    createEvent(EVENT_TYPES.CONTRIBUTION, { memberId: 'm1', amount: 250 }),
    createEvent(EVENT_TYPES.CONTRIBUTION, { memberId: 'm2', amount: 75 }),
  ];
  const state = rebuildState(events);
  const byMember = getMemberContributions(state);
  assert.equal(byMember['Alice'], 350);
  assert.equal(byMember['Bob'], 75);
});

// ═══════════════════════════════════════════════════════════════
// E2E: Input Validation
// ═══════════════════════════════════════════════════════════════

test('E2E: sanitizeAmount handles edge cases comprehensively', () => {
  assert.equal(sanitizeAmount(0), 0);
  assert.equal(sanitizeAmount(-100), 0);
  assert.equal(sanitizeAmount(NaN), 0);
  assert.equal(sanitizeAmount(Infinity), 0);
  assert.equal(sanitizeAmount(''), 0);
  assert.equal(sanitizeAmount(null), 0);
  assert.equal(sanitizeAmount(undefined), 0);
  assert.equal(sanitizeAmount(99.999), 100);
  assert.equal(sanitizeAmount(1), 1);
});

test('E2E: sanitizeText handles edge cases comprehensively', () => {
  assert.equal(sanitizeText(''), '');
  assert.equal(sanitizeText(null), '');
  assert.equal(sanitizeText(undefined), '');
  assert.equal(sanitizeText(123), '123');
  assert.equal(sanitizeText('  spaces  '), 'spaces');
  assert.equal(sanitizeText('a'.repeat(1000), 10), 'a'.repeat(10));
});

test('E2E: escapeHtml prevents XSS vectors', () => {
  assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(escapeHtml('"onmouseover="alert(1)"'), '&quot;onmouseover=&quot;alert(1)&quot;');
  assert.equal(escapeHtml("'onclick='alert(1)'"), '&#39;onclick=&#39;alert(1)&#39;');
  assert.equal(escapeHtml('&amp;'), '&amp;amp;');
});
