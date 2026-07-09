// PEÑA — Autobase event schema types
// Ledger is deterministically rebuilt from these events on any device.

/**
 * @typedef {Object} Member
 * @property {string} id - Unique member ID
 * @property {string} name - Display name
 * @property {string} pubkey - Public key for signing
 * @property {string} walletAddr - WDK wallet address
 * @property {'founder'|'member'|'approver'} role
 */

/**
 * @typedef {Object} Contribution
 * @property {string} memberId
 * @property {number} amount - Amount in USDt
 * @property {string} txHash - On-chain transaction hash
 * @property {number} ts - Unix timestamp
 */

/**
 * @typedef {Object} Proposal
 * @property {string} id - Unique proposal ID
 * @property {string} payee - Recipient address
 * @property {number} amount - Amount in USDt
 * @property {'USDt'} currency
 * @property {string} purpose - Description of spending
 * @property {string} [receiptRef] - Hyperblobs reference to receipt image
 * @property {string} createdBy - Member ID
 * @property {number} ts
 */

/**
 * @typedef {Object} Approval
 * @property {string} proposalId
 * @property {string} memberId
 * @property {string} sig - Cryptographic signature
 * @property {number} ts
 */

/**
 * @typedef {Object} Execution
 * @property {string} proposalId
 * @property {string} txHash - On-chain transaction hash
 * @property {number} ts
 */

/**
 * @typedef {Object} ReceiptDoc
 * @property {string} proposalId
 * @property {{payee: string, amount: number, category: string, date: string}} parsed - QVAC VLM output
 */

// Event type constants
export const EventType = {
  MEMBER_JOIN: 'member:join',
  MEMBER_LEAVE: 'member:leave',
  CONTRIBUTION: 'contribution',
  PROPOSAL_CREATE: 'proposal:create',
  PROPOSAL_APPROVE: 'proposal:approve',
  PROPOSAL_EXECUTE: 'proposal:execute',
  RECEIPT_PARSE: 'receipt:parse',
}

// Factory functions for creating events
export function createEvent(type, data) {
  return {
    type,
    data,
    ts: Date.now(),
  }
}
