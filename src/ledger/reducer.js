// PEÑA — Autobase reducer
// Rebuilds the treasury state from the event log (zero-DB approach).

import { EventType } from './schema.js'

/**
 * Initial empty state for the treasury.
 */
export function initialState() {
  return {
    members: new Map(),       // id → Member
    contributions: [],        // Contribution[]
    proposals: new Map(),     // id → Proposal + approvals
    executions: [],           // Execution[]
    receipts: new Map(),      // proposalId → ReceiptDoc
    balance: 0,               // Current treasury balance in USDt
  }
}

/**
 * Apply a single event to the state.
 * Pure function — no side effects.
 */
export function applyEvent(state, event) {
  const next = { ...state }

  switch (event.type) {
    case EventType.MEMBER_JOIN:
      next.members = new Map(state.members)
      next.members.set(event.data.id, event.data)
      break

    case EventType.MEMBER_LEAVE:
      next.members = new Map(state.members)
      next.members.delete(event.data.id)
      break

    case EventType.CONTRIBUTION:
      next.contributions = [...state.contributions, event.data]
      next.balance = state.balance + event.data.amount
      break

    case EventType.PROPOSAL_CREATE:
      next.proposals = new Map(state.proposals)
      next.proposals.set(event.data.id, {
        ...event.data,
        approvals: [],
        status: 'pending',
      })
      break

    case EventType.PROPOSAL_APPROVE:
      next.proposals = new Map(state.proposals)
      const prop = next.proposals.get(event.data.proposalId)
      if (prop) {
        prop.approvals = [...prop.approvals, event.data]
      }
      break

    case EventType.PROPOSAL_EXECUTE:
      next.executions = [...state.executions, event.data]
      next.proposals = new Map(state.proposals)
      const executedProp = next.proposals.get(event.data.proposalId)
      if (executedProp) {
        executedProp.status = 'executed'
      }
      next.balance = state.balance - (executedProp?.amount || 0)
      break

    case EventType.RECEIPT_PARSE:
      next.receipts = new Map(state.receipts)
      next.receipts.set(event.data.proposalId, event.data)
      break

    default:
      // Unknown event type — ignore (forward compatibility)
      break
  }

  return next
}

/**
 * Rebuild full state from an array of events.
 */
export function rebuildState(events) {
  return events.reduce(applyEvent, initialState())
}

/**
 * Check if a proposal has reached M-of-N approval threshold.
 */
export function isApproved(proposal, threshold) {
  return proposal.approvals.length >= threshold
}
