# PEÑA 🏟️

> **Transparent self-custody treasury for football fan groups / ultras / peñas.**
> Eliminates treasurer fraud and opaque cash: collective wallet + P2P ledger visible to every member.

**Tracks:** WDK (core) + Pears (genuine) + QVAC (light, honest)
**Hackathon:** Tether Developers Cup

---

## 🎯 The Problem

Fan groups handle real money — tifo, travel logistics, bus rentals, charity, dues. Almost always it's **cash + one treasurer = opacity and abuse**. In emerging markets (peñas in LatAm, fan clubs in Africa): no bank, inflation eats cash, cross-border collections are impossible.

## ✅ The Solution

Collective **self-custody USD₮ wallet** with **transparent P2P ledger** — every income/expense is visible to all members and confirmed by M-of-N. No trusted operator, zero hosting, works offline.

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────┐
│  UI (React Native + WDK UI Kit, or Electron)             │
│  - Transparent audit feed (who paid / what was spent)    │
│  - Proposal cards + approval buttons                     │
│  - Treasury balance, history, export report              │
├──────────────────────────────────────────────────────────┤
│  QVAC (on-device, @qvac/sdk)                             │
│  - VLM: receipt photo → {payee, amount, category, date}  │
│  - LLM: NL queries to local ledger (RAG)                 │
├──────────────────────────────────────────────────────────┤
│  Pears / Holepunch (coordination, no server)             │
│  - Autobase: multi-writer event log of treasury          │
│  - Hypercore: tamper-evident history; Corestore persist  │
│  - Hyperswarm: P2P discovery by invite-code              │
├──────────────────────────────────────────────────────────┤
│  WDK (money)                                             │
│  - ERC-4337 smart account = treasury; M-of-N approvers   │
│  - Gasless USD₮ transfer (paymaster in USD₮ / EIP-3009)  │
│  - Each member: self-custody signer (pear-wrk-wdk)       │
└──────────────────────────────────────────────────────────┘
```

## 📊 Data Model (Autobase events)

- `Member { id, name, pubkey, walletAddr, role }`
- `Contribution { memberId, amount, txHash, ts }`
- `Proposal { id, payee, amount, currency:USDt, purpose, receiptRef?, createdBy, ts }`
- `Approval { proposalId, memberId, sig, ts }` → needs M-of-N
- `Execution { proposalId, txHash, ts }` → written after successful transfer
- `ReceiptDoc { proposalId, parsed:{payee,amount,category,date} }` (from QVAC VLM)

Ledger is deterministically rebuilt from the log on any device (zero-DB approach).

## 🔄 Key Flows

### Onboarding
1. Founder creates treasury → deploys ERC-4337 smart account (WDK), sets signers + M-of-N threshold
2. Generates invite-code (Hyperswarm topic + room key) → shares with members
3. Each member creates self-custody wallet (WDK) and joins the swarm

### Contribution
Member sends USD₮ to treasury (gasless) → tx enters log → balance updates for everyone

### Spending (anti-fraud)
1. Member creates `Proposal` (+ receipt photo → QVAC parses)
2. Proposal replicates across swarm, visible to all
3. M-of-N members sign `Approval`
4. On threshold → WDK executes gasless USD₮ transfer to payee
5. `Execution{txHash}` written to log → immutable audit trail

### Transparency / Queries
Any member: audit feed + NL query to QVAC ("balance?", "how much on buses this season?")

## 🛠️ Tech Stack

- `@tetherto/wdk` + `wdk-wallet-evm-erc-4337` (gasless, paymaster)
- `pear-wrk-wdk` (keys in Bare-worklet)
- Autobase / Hypercore / Hyperswarm / Corestore
- `@qvac/sdk` (VLM + LLM, model ≤1.7–2B)
- React Native (WDK UI Kit) or Electron

## 🚀 Quick Start

```bash
# Clone
git clone https://github.com/anna-stolbovskaja/PENA.git
cd PENA

# Install dependencies
npm install

# Run dev
npm run dev
```

### Prerequisites
- Node.js 20+
- Pear runtime (`pear` CLI)
- WDK configured for testnet

## 🗺️ Roadmap

- **Day 0–1:** WDK — create smart account, send gasless USD₮ on testnet
- **Day 2:** Autobase ledger + P2P sync — 2 devices see one log
- **Day 3:** Full cycle `Proposal → M-of-N Approval → Execution(txHash)`
- **Day 4:** QVAC — receipt parsing (VLM) + NL query to ledger
- **Day 5:** UX — transparent audit feed, approval cards, balance
- **Day 6:** Demo video (≤3 min), README with judge-map, evidence-bundle

## 📋 Judge Map

| Criterion | Evidence |
|---|---|
| Technical ambition | Multi-writer P2P ledger + M-of-N gasless smart account |
| User experience | Transparent audit feed, simple approval cards |
| Real-world use | Treasurer fraud — real pain of real organizations |
| Creativity | P2P transparent treasury without trusted operator |
| Real use of track | WDK load-bearing + Pears genuine + QVAC honest light |

## 🎥 Evidence Bundle

- Verifiable on-chain tx-hashes
- Screencast of ledger sync on 2 devices (P2P without server)
- Demo of receipt parsing and NL query
- README with judge criteria map + clear run steps

## ⚠️ Risks & Mitigations

1. **"Why P2P, not a server?"** → transparency without trusted operator + zero hosting + group privacy + offline resilience
2. **M-of-N on ERC-4337** — test early (Day 1). Fallback: 2-of-3 guardian scheme
3. **QVAC must be genuine** — keep receipt parsing + NL query real, not decoration
4. **Adoption friction** — for demo, take one vivid scenario (tifo collection → transparent spending)

## 📄 License

MIT
