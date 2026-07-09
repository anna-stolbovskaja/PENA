// PEÑA — P2P swarm coordination via Hyperswarm
// Members discover each other by invite-code (Hyperswarm topic)

import Hyperswarm from 'hyperswarm'
import Corestore from 'corestore'

/**
 * Create or join a treasury swarm.
 * @param {string} inviteCode - Hyperswarm topic hex string
 * @param {Object} corestore - Corestore instance for persistence
 * @returns {Promise<{swarm: Hyperswarm, topic: Buffer}>}
 */
export async function joinSwarm(inviteCode, corestore) {
  const swarm = new Hyperswarm()
  const topic = Buffer.from(inviteCode, 'hex')

  swarm.on('connection', (conn, info) => {
    // Replicate corestore over this connection
    corestore.replicate(conn)
  })

  swarm.join(topic, {
    server: true,
    client: true,
  })

  await swarm.flush()

  return { swarm, topic }
}

/**
 * Generate a new invite-code for a treasury group.
 * @returns {string} Hex-encoded topic
 */
export function generateInviteCode() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 64)
}

/**
 * Leave the swarm and clean up.
 * @param {Hyperswarm} swarm
 */
export async function leaveSwarm(swarm) {
  await swarm.destroy()
}
