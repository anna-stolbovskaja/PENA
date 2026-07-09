import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventType, createEvent } from '../src/ledger/schema.js'

test('EventType has all expected types', () => {
  assert.equal(EventType.MEMBER_JOIN, 'member:join')
  assert.equal(EventType.MEMBER_LEAVE, 'member:leave')
  assert.equal(EventType.CONTRIBUTION, 'contribution')
  assert.equal(EventType.PROPOSAL_CREATE, 'proposal:create')
  assert.equal(EventType.PROPOSAL_APPROVE, 'proposal:approve')
  assert.equal(EventType.PROPOSAL_EXECUTE, 'proposal:execute')
  assert.equal(EventType.RECEIPT_PARSE, 'receipt:parse')
})

test('createEvent returns event with type, data, and timestamp', () => {
  const event = createEvent(EventType.CONTRIBUTION, { amount: 100 })
  assert.equal(event.type, 'contribution')
  assert.equal(event.data.amount, 100)
  assert.ok(typeof event.ts === 'number')
})
