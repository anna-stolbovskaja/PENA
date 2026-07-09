import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENT_TYPES,
  createEvent,
  initialState,
  applyEvent,
  rebuildState,
  isApproved,
  getCategorySummary,
  getMemberContributions,
  escapeHtml,
} from '../lib/ledger.js';

test('initialState returns empty collections and zero balance', () => {
  const state = initialState();
  assert.equal(state.balance, 0);
  assert.equal(state.members.length, 0);
  assert.equal(state.contributions.length, 0);
  assert.equal(state.proposals.length, 0);
  assert.equal(state.executions.length, 0);
  assert.equal(state.receipts.length, 0);
});

test('createEvent returns event with type, data, ts, and id', () => {
  const event = createEvent(EVENT_TYPES.CONTRIBUTION, { amount: 100 });
  assert.equal(event.type, 'contribution');
  assert.equal(event.data.amount, 100);
  assert.ok(typeof event.ts === 'number');
  assert.ok(typeof event.id === 'string');
});

test('applyEvent MEMBER_JOIN adds member', () => {
  const state = initialState();
  const member = { id: 'm1', name: 'Alice', role: 'founder', walletAddr: '0x1' };
  applyEvent(state, createEvent(EVENT_TYPES.MEMBER_JOIN, member));
  assert.equal(state.members.length, 1);
  assert.equal(state.members[0].name, 'Alice');
});

test('applyEvent MEMBER_JOIN does not duplicate', () => {
  const state = initialState();
  const member = { id: 'm1', name: 'Alice', role: 'founder', walletAddr: '0x1' };
  applyEvent(state, createEvent(EVENT_TYPES.MEMBER_JOIN, member));
  applyEvent(state, createEvent(EVENT_TYPES.MEMBER_JOIN, member));
  assert.equal(state.members.length, 1);
});

test('applyEvent CONTRIBUTION increases balance', () => {
  const state = initialState();
  applyEvent(state, createEvent(EVENT_TYPES.CONTRIBUTION, { memberId: 'm1', amount: 500, txHash: '0xabc', ts: Date.now() }));
  assert.equal(state.balance, 500);
  assert.equal(state.contributions.length, 1);
});

test('applyEvent CONTRIBUTION handles NaN amount safely', () => {
  const state = initialState();
  applyEvent(state, createEvent(EVENT_TYPES.CONTRIBUTION, { memberId: 'm1', amount: 'invalid', txHash: '0xabc', ts: Date.now() }));
  assert.equal(state.balance, 0);
});

test('applyEvent PROPOSAL_CREATE adds pending proposal', () => {
  const state = initialState();
  const proposal = { id: 'p1', payee: 'Vendor', amount: 100, currency: 'USDt', purpose: 'Test', createdBy: 'm1', ts: Date.now() };
  applyEvent(state, createEvent(EVENT_TYPES.PROPOSAL_CREATE, proposal));
  assert.equal(state.proposals.length, 1);
  assert.equal(state.proposals[0].status, 'pending');
  assert.equal(state.proposals[0].approvals.length, 0);
});

test('applyEvent PROPOSAL_APPROVE adds approval', () => {
  let state = initialState();
  state = applyEvent(state, createEvent(EVENT_TYPES.PROPOSAL_CREATE, { id: 'p1', payee: 'V', amount: 50, currency: 'USDt', purpose: 'T', createdBy: 'm1', ts: 1 }));
  state = applyEvent(state, createEvent(EVENT_TYPES.PROPOSAL_APPROVE, { proposalId: 'p1', memberId: 'm2', sig: '0xsig', ts: 2 }));
  assert.equal(state.proposals[0].approvals.length, 1);
});

test('applyEvent PROPOSAL_APPROVE does not duplicate from same member', () => {
  let state = initialState();
  state = applyEvent(state, createEvent(EVENT_TYPES.PROPOSAL_CREATE, { id: 'p1', payee: 'V', amount: 50, currency: 'USDt', purpose: 'T', createdBy: 'm1', ts: 1 }));
  state = applyEvent(state, createEvent(EVENT_TYPES.PROPOSAL_APPROVE, { proposalId: 'p1', memberId: 'm2', sig: '0xs1', ts: 2 }));
  state = applyEvent(state, createEvent(EVENT_TYPES.PROPOSAL_APPROVE, { proposalId: 'p1', memberId: 'm2', sig: '0xs2', ts: 3 }));
  assert.equal(state.proposals[0].approvals.length, 1);
});

test('applyEvent PROPOSAL_EXECUTE decreases balance and marks executed', () => {
  let state = initialState();
  state = applyEvent(state, createEvent(EVENT_TYPES.CONTRIBUTION, { memberId: 'm1', amount: 200, txHash: '0x1', ts: 1 }));
  state = applyEvent(state, createEvent(EVENT_TYPES.PROPOSAL_CREATE, { id: 'p1', payee: 'V', amount: 80, currency: 'USDt', purpose: 'T', createdBy: 'm1', ts: 2 }));
  state = applyEvent(state, createEvent(EVENT_TYPES.PROPOSAL_EXECUTE, { proposalId: 'p1', txHash: '0xexec', ts: 3 }));
  assert.equal(state.balance, 120);
  assert.equal(state.proposals[0].status, 'executed');
  assert.equal(state.executions.length, 1);
});

test('applyEvent PROPOSAL_EXECUTE does not double-execute', () => {
  let state = initialState();
  state = applyEvent(state, createEvent(EVENT_TYPES.CONTRIBUTION, { memberId: 'm1', amount: 200, txHash: '0x1', ts: 1 }));
  state = applyEvent(state, createEvent(EVENT_TYPES.PROPOSAL_CREATE, { id: 'p1', payee: 'V', amount: 80, currency: 'USDt', purpose: 'T', createdBy: 'm1', ts: 2 }));
  state = applyEvent(state, createEvent(EVENT_TYPES.PROPOSAL_EXECUTE, { proposalId: 'p1', txHash: '0x1', ts: 3 }));
  state = applyEvent(state, createEvent(EVENT_TYPES.PROPOSAL_EXECUTE, { proposalId: 'p1', txHash: '0x2', ts: 4 }));
  assert.equal(state.balance, 120);
  assert.equal(state.executions.length, 1);
});

test('applyEvent RECEIPT_PARSE adds receipt', () => {
  let state = initialState();
  state = applyEvent(state, createEvent(EVENT_TYPES.RECEIPT_PARSE, { proposalId: 'p1', parsed: { payee: 'Store', amount: 50, category: 'Food', date: '2026-01-01' } }));
  assert.equal(state.receipts.length, 1);
});

test('applyEvent unknown type is ignored', () => {
  const state = initialState();
  applyEvent(state, { type: 'future:event', data: {}, ts: 1, id: 'x' });
  assert.equal(state.balance, 0);
  assert.equal(state.members.length, 0);
});

test('rebuildState replays events in order', () => {
  const events = [
    createEvent(EVENT_TYPES.MEMBER_JOIN, { id: 'm1', name: 'A', role: 'founder', walletAddr: '0x1' }),
    createEvent(EVENT_TYPES.CONTRIBUTION, { memberId: 'm1', amount: 300, txHash: '0x1', ts: 1 }),
    createEvent(EVENT_TYPES.CONTRIBUTION, { memberId: 'm1', amount: 200, txHash: '0x2', ts: 2 }),
  ];
  const state = rebuildState(events);
  assert.equal(state.balance, 500);
  assert.equal(state.contributions.length, 2);
  assert.equal(state.members.length, 1);
});

test('isApproved returns true when threshold met', () => {
  const proposal = { approvals: [{}, {}, {}] };
  assert.ok(isApproved(proposal, 3));
  assert.ok(!isApproved(proposal, 4));
  assert.ok(!isApproved(null, 1));
});

test('getCategorySummary groups expenses', () => {
  const state = {
    proposals: [
      { status: 'executed', amount: 100, category: 'Transport' },
      { status: 'executed', amount: 50, category: 'Transport' },
      { status: 'executed', amount: 200, category: 'Tifo' },
      { status: 'pending', amount: 999, category: 'Transport' },
    ],
  };
  const summary = getCategorySummary(state);
  assert.equal(summary.Transport, 150);
  assert.equal(summary.Tifo, 200);
  assert.equal(summary.Transport, 150);
});

test('getMemberContributions groups by member name', () => {
  const state = {
    members: [{ id: 'm1', name: 'Alice' }, { id: 'm2', name: 'Bob' }],
    contributions: [
      { memberId: 'm1', amount: 100 },
      { memberId: 'm1', amount: 50 },
      { memberId: 'm2', amount: 200 },
    ],
  };
  const summary = getMemberContributions(state);
  assert.equal(summary.Alice, 150);
  assert.equal(summary.Bob, 200);
});

test('escapeHtml escapes all dangerous characters', () => {
  assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(escapeHtml('"quote"'), '&quot;quote&quot;');
  assert.equal(escapeHtml("'apostrophe''), '&#39;apostrophe&#39;');
  assert.equal(escapeHtml('&amp'), '&amp;amp');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(123), '123');
});

test('escapeHtml handles edge cases', () => {
  assert.equal(escapeHtml(''), '');
  assert.equal(escapeHtml('normal text'), 'normal text');
  assert.equal(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
});
