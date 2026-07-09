# PEÑA — Architecture

## Layer Overview

```
UI → QVAC → Pears/Holepunch → WDK
```

### 1. UI Layer (React Native + WDK UI Kit / Electron)
- Transparent audit feed: who contributed, what was spent
- Proposal cards with approve/reject buttons
- Treasury balance, history, export report
- Receipt photo capture → QVAC parsing

### 2. QVAC Layer (on-device, @qvac/sdk)
- **VLM (SmolVLM2 500M–2B):** receipt photo → structured data {payee, amount, category, date}
- **LLM:** natural language queries against local ledger via RAG
- **All inference on-device** — no server, no API calls, privacy preserved

### 3. Pears / Holepunch Layer (coordination, no server)
- **Autobase:** multi-writer append-only event log of treasury events
- **Hypercore:** tamper-evident history with Corestore persistence
- **Hyperswarm:** P2P discovery of group members by invite-code
- **Hyperblobs:** storage for receipt images

### 4. WDK Layer (money)
- **ERC-4337 smart account** = treasury; M-of-N approvers
- **Gasless USD₮ transfer** (paymaster pays gas in USD₮ / EIP-3009 transferWithAuthorization)
- **Each member:** self-custody signer via `pear-wrk-wdk` worklet (keys in Bare-worklet, off main thread)

## Data Model (Autobase Events)

```typescript
interface Member {
  id: string
  name: string
  pubkey: string
  walletAddr: string
  role: 'founder' | 'member' | 'approver'
}

interface Contribution {
  memberId: string
  amount: number  // in USDt
  txHash: string
  ts: number
}

interface Proposal {
  id: string
  payee: string
  amount: number  // in USDt
  currency: 'USDt'
  purpose: string
  receiptRef?: string  // Hyperblobs ref
  createdBy: string
  ts: number
}

interface Approval {
  proposalId: string
  memberId: string
  sig: string
  ts: number
}

interface Execution {
  proposalId: string
  txHash: string
  ts: number
}

interface ReceiptDoc {
  proposalId: string
  parsed: {
    payee: string
    amount: number
    category: string
    date: string
  }
}
```

The ledger is deterministically rebuilt from the event log on any device (zero-DB approach).

## Key Flows

### A. Group Onboarding
1. Founder creates treasury → deploys ERC-4337 smart account (WDK), sets list of signers and M-of-N threshold
2. Generates invite-code (Hyperswarm topic + room key) → shares with members
3. Each member creates self-custody wallet (WDK) and joins the swarm

### B. Contribution
Member sends USD₮ to treasury (gasless) → tx enters Autobase log → balance updates for all

### C. Spending (anti-fraud)
1. Member creates `Proposal` (+ receipt photo → QVAC VLM parses)
2. Proposal replicates across swarm, visible to all
3. M-of-N members sign `Approval`
4. On threshold → WDK executes gasless USD₮ transfer to payee
5. `Execution{txHash}` written to log → immutable audit trail

### D. Transparency / Queries
Any member: audit feed + NL query to QVAC ("balance?", "how much on buses this season?")

## Track Alignment

| Track | Usage | Genuine? |
|---|---|---|
| **WDK** (core) | Self-custody wallet per member; treasury as ERC-4337 smart account with M-of-N; gasless USD₮ | 🟢 strong, load-bearing |
| **Pears** | Autobase multi-writer ledger; P2P sync without server; privacy | 🟢 genuine (server would kill the "trust without operator" thesis) |
| **QVAC** | On-device receipt parsing (VLM); NL queries to ledger (LLM/RAG); auto-summary | 🟡 light but honest (not decoration) |
