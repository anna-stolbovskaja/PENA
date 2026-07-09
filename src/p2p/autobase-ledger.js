// PEÑA — Autobase multi-writer ledger
// Append-only, tamper-evident event log replicated via P2P

import Autobase from 'autobase'
import Hypercore from 'hypercore'
import Corestore from 'corestore'

/**
 * Initialize the treasury ledger.
 * @param {string} storagePath - Path for Corestore persistence
 * @param {Buffer} [localKey] - Local writer key (for existing members)
 * @returns {Promise<{autobase: Autobase, corestore: Corestore}>}
 */
export async function initLedger(storagePath, localKey) {
  const corestore = new Corestore(storagePath)

  const localWriter = corestore.get({
    name: 'treasury-writer',
    key: localKey,
  })
  await localWriter.ready()

  const autobase = new Autobase({
    localInput: localWriter,
    localOutput: localWriter,
    corestore,
  })

  await autobase.ready()

  return { autobase, corestore }
}

/**
 * Append a treasury event to the ledger.
 * @param {Autobase} autobase
 * @param {Object} event - Event from schema.js
 */
export async function appendEvent(autobase, event) {
  const buf = Buffer.from(JSON.stringify(event))
  await autobase.append(buf)
}

/**
 * Read all events from the ledger.
 * @param {Autobase} autobase
 * @returns {Promise<Object[]>} Array of events
 */
export async function readEvents(autobase) {
  const events = []
  for await (const node of autobase.view) {
    events.push(JSON.parse(node.value.toString()))
  }
  return events
}

/**
 * Add a remote writer to the autobase (when a new member joins).
 * @param {Autobase} autobase
 * @param {Buffer} remoteKey - Public key of the remote writer
 */
export async function addWriter(autobase, remoteKey) {
  await autobase.addWriter(remoteKey)
}
