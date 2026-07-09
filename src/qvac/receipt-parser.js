// PEÑA — QVAC receipt parser
// On-device VLM: receipt photo → structured data

/**
 * Parse a receipt photo using QVAC VLM (SmolVLM2).
 * @param {Object} qvac - QVAC SDK instance
 * @param {Buffer|Blob} image - Receipt photo
 * @returns {Promise<{payee: string, amount: number, category: string, date: string}>}
 */
export async function parseReceipt(qvac, image) {
  // TODO: Implement with @qvac/sdk VLM
  // Prompt: "Extract from this receipt: payee name, total amount, category (transport/food/equipment/tickets/other), date"
  // Return structured JSON
  throw new Error('Not yet implemented — see roadmap Day 4')
}

/**
 * Natural language query against the local ledger.
 * @param {Object} qvac - QVAC SDK instance
 * @param {Object} ledgerState - Current rebuilt ledger state
 * @param {string} query - Natural language question
 * @returns {Promise<string>} Answer
 */
export async function queryLedger(qvac, ledgerState, query) {
  // TODO: Implement with @qvac/sdk LLM + RAG
  // Index ledger events as context
  // Examples: "balance?", "how much on buses this season?", "who contributed most?"
  throw new Error('Not yet implemented — see roadmap Day 4')
}

/**
 * Generate a monthly spending summary.
 * @param {Object} qvac - QVAC SDK instance
 * @param {Object} ledgerState - Current rebuilt ledger state
 * @returns {Promise<string>} Summary text
 */
export async function monthlySummary(qvac, ledgerState) {
  // TODO: Aggregate spending by category for current month
  // Use LLM to generate natural language summary
  throw new Error('Not yet implemented — see roadmap Day 4')
}
