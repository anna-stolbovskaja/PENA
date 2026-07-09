# PEÑA — Evidence Bundle

> What competitors underestimate: verifiable proof that the system works.

## 1. On-chain Transaction Hashes

Every contribution and execution produces a verifiable on-chain tx-hash. These are written to the Autobase log as immutable audit entries.

**To verify:** Copy tx-hash → paste into testnet block explorer.

## 2. P2P Sync Screencast

- Two devices (laptop + phone, or two laptops)
- Device A creates a contribution
- Device B sees it appear in the audit feed within seconds
- No server involved — pure Hyperswarm/Autobase replication

## 3. Receipt Parsing Demo

- Take a photo of a real receipt (bus rental, equipment purchase)
- QVAC VLM (SmolVLM2) processes on-device
- Output: `{payee, amount, category, date}` — structured data attached to proposal

## 4. Natural Language Query Demo

- "What's the current balance?" → instant answer from local ledger
- "How much did we spend on buses this season?" → aggregated from proposals
- "Who contributed the most?" → member ranking
- All processed on-device via QVAC LLM + RAG, no API calls

## 5. Reproducibility

- `git clone` → `npm install` → `npm run dev`
- Clear instructions in README
- Testnet configuration documented
