// PEÑA — Entry point
// Transparent self-custody treasury for football fan groups

// Export core modules
export { EventType, createEvent } from './ledger/schema.js'
export { initialState, applyEvent, rebuildState, isApproved } from './ledger/reducer.js'
export { initLedger, appendEvent, readEvents, addWriter } from './p2p/autobase-ledger.js'
export { joinSwarm, generateInviteCode, leaveSwarm } from './p2p/swarm.js'
export { createTreasury, contribute, executeProposal, getBalance } from './wdk/wallet.js'
export { parseReceipt, queryLedger, monthlySummary } from './qvac/receipt-parser.js'
