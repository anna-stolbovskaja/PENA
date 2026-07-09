// PEÑA — WDK wallet integration
// ERC-4337 smart account = treasury; M-of-N approvers; gasless USD₮

/**
 * Create a new treasury smart account.
 * @param {Object} wdk - WDK instance
 * @param {Object} config
 * @param {string[]} config.approvers - List of approver addresses
 * @param {number} config.threshold - M-of-N threshold
 * @returns {Promise<{accountAddress: string}>}
 */
export async function createTreasury(wdk, config) {
  // TODO: Implement with wdk-wallet-evm-erc-4337
  // Deploy smart account with M-of-N guardian module
  // Configure paymaster for gasless USD₮
  throw new Error('Not yet implemented — see roadmap Day 0-1')
}

/**
 * Send a gasless USD₮ contribution to the treasury.
 * @param {Object} wdk - WDK instance
 * @param {string} from - Member wallet address
 * @param {string} treasuryAddress - Treasury smart account address
 * @param {number} amount - Amount in USD₮
 * @returns {Promise<{txHash: string}>}
 */
export async function contribute(wdk, from, treasuryAddress, amount) {
  // TODO: Implement gasless transfer via EIP-3009 transferWithAuthorization
  // Paymaster covers gas fees in USD₮
  throw new Error('Not yet implemented — see roadmap Day 0-1')
}

/**
 * Execute a approved proposal — gasless USD₮ transfer to payee.
 * @param {Object} wdk - WDK instance
 * @param {string} treasuryAddress - Treasury smart account address
 * @param {Object} proposal - Approved proposal
 * @param {string[]} approvalSigs - M-of-N signatures
 * @returns {Promise<{txHash: string}>}
 */
export async function executeProposal(wdk, treasuryAddress, proposal, approvalSigs) {
  // TODO: Implement with ERC-4337 UserOp
  // Include M-of-N signatures in the UserOp
  // Paymaster covers gas
  throw new Error('Not yet implemented — see roadmap Day 3')
}

/**
 * Get treasury balance.
 * @param {Object} wdk - WDK instance
 * @param {string} treasuryAddress
 * @returns {Promise<number>} Balance in USD₮
 */
export async function getBalance(wdk, treasuryAddress) {
  // TODO: Query USD₮ balance of smart account
  throw new Error('Not yet implemented')
}
