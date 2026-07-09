# PEÑA — Roadmap

> Knockout format: first working build + demo needed by **8 July** (top-16 cutoff).

## Phase 1: Hero Feature (Day 0–1)
- [ ] WDK: create ERC-4337 smart account on testnet
- [ ] WDK: send gasless USD₮ transfer on testnet
- [ ] Verify M-of-N approval mechanics (highest technical risk)
- [ ] Fallback plan: 2-of-3 guardian scheme if M-of-N is blocked

## Phase 2: P2P Ledger (Day 2)
- [ ] Autobase: multi-writer event log for treasury events
- [ ] Hypercore: tamper-evident history
- [ ] Hyperswarm: P2P discovery by invite-code
- [ ] Demo: 2 devices see one synchronized log of contributions

## Phase 3: Full Spending Cycle (Day 3)
- [ ] Proposal creation flow
- [ ] M-of-N Approval signing
- [ ] WDK execution: gasless USD₮ transfer to payee
- [ ] Execution{txHash} written to immutable log

## Phase 4: QVAC Integration (Day 4)
- [ ] VLM: receipt photo → {payee, amount, category, date}
- [ ] LLM: NL query to local ledger via RAG
- [ ] Auto-summary: monthly spending breakdown

## Phase 5: UX Polish (Day 5)
- [ ] Transparent audit feed UI
- [ ] Proposal cards with approve/reject
- [ ] Treasury balance display
- [ ] Receipt photo capture flow

## Phase 6: Submission (Day 6)
- [ ] Demo video (≤3 min)
- [ ] README with judge-map
- [ ] Evidence-bundle: tx-hashes, 2-device sync screencast, receipt parsing demo
- [ ] **Submit by 8 July**

## Post-Cutoff (toward 12/14 July)
- [ ] Hardening, edge cases
- [ ] EM narrative (LatAm peñas scenario)
- [ ] UX polish
- [ ] Optional: multi-chain support
