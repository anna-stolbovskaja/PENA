import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialState, applyEvent, rebuildState, isApproved } from '../src/ledger/reducer.js'
import { EventType, createEvent } from '../src/ledger/schema.js'

test('initial state has empty collections and zero balance', () => {
  const state = initialState()
  assert.equal(state.balance, 0)
  assert.equal(state.contributions.length, 0)
  assert.equal(state.members.size, 0)
  assert.equal(state.proposals.size, 0)
})

test('member join adds to members map', () => {
  const state = initialState()
  const member = { id: 'm1', name: 'Alice', pubkey: 'pk1', walletAddr: '0x1', role: 'founder' }
  const event = createEvent(EventType.MEMBER_JOIN, member)
  const next = applyEvent(state, event)
  assert.equal(next.members.size, 1)
  assert.deepEqual(next.members.get('m1'), member)
})

test('contribution increases balance', () => {
  const state = initialState()
  const contribution = { memberId: 'm1', amount: 100, txHash: '0xabc', ts: Date.now() }
  const event = createEvent(EventType.CONTRIBUTION, contribution)
  const next = applyEvent(state, event)
  assert.equal(next.balance, 100)
  assert.equal(next.contributions.length, 1)
})

test('proposal create adds to proposals map as pending', () => {
  const state = initialState()
  const proposal = { id: 'p1', payee: '0xpayee', amount: 50, currency: 'USDt', purpose: 'Bus rental', createdBy: 'm1', ts: Date.now() }
  const event = createEvent(EventType.PROPOSAL_CREATE, proposal)
  const next = applyEvent(state, event)
  assert.equal(next.proposals.size, 1)
  const prop = next.proposals.get('p1')
  assert.equal(prop.status, 'pending')
  assert.equal(prop.approvals.length, 0)
})

test('approval adds to proposal approvals', () => {
  let state = initialState()
  const proposal = { id: 'p1', payee: '0xpayee', amount: 50, currency: 'USDt', purpose: 'Bus', createdBy: 'm1', ts: Date.now() }
  state = applyEvent(state, createEvent(EventType.PROPOSAL_CREATE, proposal))

  const approval = { proposalId: 'p1', memberId: 'm2', sig: 'sig1', ts: Date.now() }
  state = applyEvent(state, createEvent(EventType.PROPOSAL_APPROVE, approval))

  const prop = state.proposals.get('p1')
  assert.equal(prop.approvals.length, 1)
})

test('isApproved returns true when threshold met', () => {
  const proposal = { id: 'p1', approvals: [{}, {}, {}], status: 'pending' }
  assert.ok(isApproved(proposal, 3))
  assert.ok(!isApproved(proposal, 4))
})

test('execution decreases balance and marks proposal executed', () => {
  let state = initialState()
  state = applyEvent(state, createEvent(EventType.CONTRIBUTION, { memberId: 'm1', amount: 100, txHash: '0x1', ts: 1 }))
  state = applyEvent(state, createEvent(EventType.PROPOSAL_CREATE, { id: 'p1', payee: '0x2', amount: 30, currency: 'USDt', purpose: 'Tifo', createdBy: 'm1', ts: 2 }))
  state = applyEvent(state, createEvent(EventType.PROPOSAL_EXECUTE, { proposalId: 'p1', txHash: '0xexec', ts: 3 }))

  assert.equal(state.balance, 70)
  assert.equal(state.proposals.get('p1').status, 'executed')
  assert.equal(state.executions.length, 1)
})

test('rebuildState replays events correctly', () => {
  const events = [
    createEvent(EventType.MEMBER_JOIN, { id: 'm1', name: 'A', pubkey: 'pk', walletAddr: '0x1', role: 'founder' }),
    createEvent(EventType.CONTRIBUTION, { memberId: 'm1', amount: 200, txHash: '0x1', ts: 1 }),
    createEvent(EventType.CONTRIBUTION, { memberId: 'm1', amount: 50, txHash: '0x2', ts: 2 }),
  ]
  const state = rebuildState(events)
  assert.equal(state.balance, 250)
  assert.equal(state.contributions.length, 2)
  assert.equal(state.members.size, 1)
})

test('unknown event type is ignored (forward compat)', () => {
  const state = initialState()
  const next = applyEvent(state, { type: 'future:event', data: {}, ts: 1 })
  assert.equal(next.balance, state.balance)
})
