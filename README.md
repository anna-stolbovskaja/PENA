# PEÑA

> **Transparent self-custody treasury for football fan groups.**
> Collective wallet. P2P ledger. Zero fraud. Zero servers.

---

## Why PEÑA

Fan groups handle real money — tifo, travel, buses, charity, dues. Almost always, it's cash plus one treasurer. That means opacity, misplaced trust, and fraud.

PEÑA replaces that with a **collective self-custody wallet** where every transaction is visible to all members, confirmed by M-of-N approvals, and synced peer-to-peer without any server.

### What makes it different

| Traditional | PEÑA |
|---|---|
| One treasurer controls all funds | M-of-N collective approval |
| Cash, no audit trail | Immutable on-chain tx hashes |
| Bank account required | Self-custody wallet, no bank needed |
| Server-dependent apps | P2P sync, works offline |
| Opaque spending | Transparent audit feed for every member |
| Manual receipt tracking | Automatic OCR receipt parsing on-device |

---

## Features

### Collective Wallet (WDK)
- Self-custody wallet per member via ethers.js v6
- EIP-3009 `transferWithAuthorization` signing for gasless USDt
- ERC-4337 smart account structure (simulated in prototype, production target: `@tetherto/wdk` ERC-4337 module)
- M-of-N approval threshold for all spending
- Cryptographic signatures on every action

### P2P Ledger (Pears)
- Append-only event log with deterministic state rebuild
- BroadcastChannel for instant same-browser sync
- WebRTC DataChannel for cross-device P2P connections
- QR code invite sharing
- Zero hosting, zero server costs, works offline
- Production target: Autobase + Hyperswarm for true serverless P2P

### On-Device Intelligence (QVAC)
- Receipt OCR via Tesseract.js (Spanish + English, runs in browser)
- Natural language queries against local ledger (Spanish + English)
- Automatic expense categorization
- No data leaves the device — no API calls, no cloud
- Production target: `@qvac/sdk` for VLM-powered receipt parsing and LLM queries

### Additional Features
- **Signature Verification** — EIP-191 signature verification on every approval in the audit feed
- **Dispute Resolution** — flag executed proposals, track disputes with reasons, resolve collectively
- **Recurring Contributions** — schedule weekly or monthly auto-contributions
- **Public Transparency Page** — downloadable HTML report for sponsors and public accountability
- **Roles & Budget Limits** — per-role proposal limits (Founder unlimited, Approver 5000, Member 500 USDt)
- **i18n** — full English/Spanish localization, auto-detects browser language
- **Onboarding Flow** — guided welcome modal for new users in Live mode
- **Budget Tracker** — set spending goals with progress bars, deadlines, and urgency indicators
- **Multi-Category Proposals** — tag proposals with multiple categories (Transport + Tickets + Food)
- **Audit Feed** — transparent, immutable, filterable log of all treasury activity with clickable detail modals
- **Feed Filters** — filter audit feed by All / Contributions / Proposals / Executions
- **Hash Routing** — deep-linkable tabs via URL hash (`#feed`, `#balance`, `#proposals`, etc.)
- **Dark/Light Theme** — toggle with localStorage persistence, auto-applied on load
- **Proposals** — M-of-N spending approvals with receipt attachment
- **Balance Dashboard** — visual charts: category breakdown, spending trends, member contributions
- **Reports** — sortable tables, exportable reports, detailed statistics
- **Notes** — locally stored treasury notes
- **PWA** — installable on mobile, works offline, responsive design, cache auto-update
- **Demo & Live modes** — explore with sample data or start fresh
- **Guided tour** — interactive walkthrough for first-time users with scroll/z-index corrections

---

## Tech Stack

| Layer | Technology | Purpose | Status |
|---|---|---|---|
| Wallet | ethers.js v6 | Key generation, EIP-3009 signing, ERC-4337 smart account | Prototype — production: `@tetherto/wdk` |
| P2P | BroadcastChannel + WebRTC | Serverless ledger sync across devices | Prototype — production: Autobase + Hyperswarm |
| OCR | Tesseract.js 5.x | On-device receipt text extraction | Prototype — production: `@qvac/sdk` VLM |
| NL Query | Local query engine | Natural language questions over ledger state | Prototype — production: `@qvac/sdk` LLM |
| Frontend | Vanilla JS + Tailwind CSS | Zero build step, instant load | Production-ready |
| i18n | Built-in EN/ES (lib/i18n.js) | Localized UI labels and messages | Production-ready |
| Actions | lib/actions.js | Modular action handlers | Production-ready |
| QVAC SDK | lib/qvac.js | Unified OCR + NL + categorization API | Production-ready |
| Encryption | Web Crypto API (AES-256-GCM) | PIN-protected encrypted localStorage | Production-ready |
| Icons | Custom SVG library | No icon font dependencies | Production-ready |
| Charts | Custom SVG charts | No chart library, animated visualizations | Production-ready |
| PWA | manifest.json | Installable, offline-capable, app-like experience | Production-ready |

---

## Quick Start

```bash
git clone https://github.com/anna-stolbovskaja/PENA.git
cd PENA
npx serve .
```

Or open `index.html` directly in any modern browser.

### Live Demo

Visit the deployed version: **https://pena-repo.vercel.app**

### Demo Video

**[▶ Watch Demo on YouTube](https://youtu.be/GnFDD0jLWho)**

---

## Tether Developers Cup — Judge Map

| Criterion | How PE\u00d1A addresses it |
|---|---|
| **Technical ambition** | Multi-writer P2P ledger + M-of-N gasless smart account + on-device OCR/NL queries. Three tracks combined (WDK + Pears + QVAC). |
| **User experience** | Transparent audit feed, simple proposal cards with approve/execute, balance dashboard with charts, guided tour, PWA installable. |
| **Real-world use** | Treasurer fraud is a real pain in real fan groups. Cash + one treasurer = opacity. PE\u00d1A solves this for unbanked/underbanked communities. |
| **Creativity** | P2P transparent treasury without a trusted operator. Zero hosting, works offline. Not another prediction pool or betting app. |
| **Real use of track** | WDK: self-custody wallet + EIP-3009 signing (core). Pears: serverless P2P ledger sync (genuine — a server would kill the "trust without operator" thesis). QVAC: on-device receipt OCR + NL queries (honest, not decoration). |

### Track Usage (Honest Assessment)

| Track | Usage | Genuine? |
|---|---|---|
| **WDK** (core) | Self-custody wallet, EIP-3009 signing, ERC-4337 smart account structure | Yes — strongest element |
| **Pears** | BroadcastChannel + WebRTC for P2P sync. Production target: Autobase/Hyperswarm | Yes — serverless is the point |
| **QVAC** | Tesseract.js OCR + local NL query engine. Production target: @qvac/sdk VLM + LLM | Light but honest — not decoration |

---

## Project Structure

```
PENA/
├── index.html          — Single entry point, meta tags, PWA manifest, structured data
├── manifest.json       — PWA manifest
├── sw.js               — Service Worker (offline cache, push notifications)
├── vercel.json         — Deployment config, security headers
├── assets/
│   ├── pena.png        — Project logo (1024x1024)
│   ├── favicon.png     — Favicon (32x32, from pena.png)
│   ├── icon-512.png    — App icon (512x512, transparent)
│   ├── icon-192.png    — App icon (192x192)
│   ├── icon-180.png    — Apple touch icon
│   └── icon.svg        — Vector icon
├── src/
│   ├── app.js          — Entry point, state, init, render, event binding
│   ├── styles.css      — Responsive styles, animations, bottom nav, modals
│   └── lib/
│       ├── ledger.js   — Append-only event log, deterministic state rebuild, integrity hashes
│       ├── actions.js  — Action handlers: contribute, propose, approve, execute, disputes, recurring
│       ├── crypto.js   — AES-256-GCM encryption for localStorage via Web Crypto API
│       ├── i18n.js     — Internationalization: EN/ES translations, language toggle
│       ├── wdk.js      — Wallet operations: ethers.js, EIP-3009, ERC-4337, signature verification
│       ├── qvac.js     — QVAC SDK: receipt OCR (Tesseract.js), NL query, expense categorization
│       ├── p2p.js      — P2P sync: BroadcastChannel, WebRTC DataChannel, peer discovery
│       ├── ui.js       — UI components: modals, toasts, tour, charts, QR, sortable tables
│       └── icons.js    — SVG icon library (50+ icons, zero dependencies)
├── tests/
│   ├── ledger.test.js  — Ledger state machine tests (38 tests)
│   ├── wdk.test.js     — Wallet/signing tests (8 tests)
│   ├── qvac.test.js    — OCR + NL query tests (14 tests)
│   ├── signing.test.js — EIP-191 signature tests (9 tests)
│   └── e2e.test.js     — End-to-end integration tests (19 tests)
├── LICENSE             — MIT
├── SECURITY.md         — Security policy
└── CONTRIBUTING.md     — Contribution guide
```

---

## Architecture

### Data Flow

```
User Action → Sign with Wallet (WDK) → Create Event → Apply to Ledger State
                                                         ↓
                                              Broadcast via P2P (Pears)
                                                         ↓
                                              Peer Devices Apply Event
                                                         ↓
                                              UI Re-renders from State
```

### Data Storage

| Data | Location | Persisted |
|---|---|---|
| Wallet keys | Browser localStorage | Yes, on-device only |
| Ledger events | localStorage + P2P sync | Yes, survives page reloads. Production: Autobase/Hypercore |
| Notes | Browser localStorage | Yes, on-device only |
| Receipt images | Processed by OCR, not stored | N/A |

### Deployment Model

**Current:** Static PWA deployed to Vercel. Works in any browser. Installable via Add to Home Screen.

**Production target:** Pear runtime application (Holepunch). Distributed as a Pear link or packaged APK. Full Autobase + Hyperswarm P2P stack. No server, no backend, no database.

### Scaling

**Vertical:** Multi-chain support (Solana, TON, TRON via WDK). Subgroup treasuries. Recurring contributions. Budget limits per category. Time-locked proposals.

**Horizontal:** Federation of fan group treasuries. Cross-group payments for shared events. Public transparency pages for sponsors. Integration with fan club management tools.

---

## Security

- All user input HTML-escaped via `escapeHtml()` to prevent XSS
- Input validation: `sanitizeAmount()` and `sanitizeText()` on all ledger events
- Event integrity: FNV-1a hash on every event; tampered events rejected on apply
- Replay protection: `Set` of applied event IDs prevents duplicate application via P2P
- Balance guard: execution blocked when treasury balance < proposal amount
- **Encrypted storage**: all sensitive data (wallet keys, ledger, budgets, notes) encrypted with AES-256-GCM via Web Crypto API; key derived from user PIN using PBKDF2 (100k iterations)
- **On-chain transactions**: real ETH transfers on Sepolia testnet via ethers.js `JsonRpcProvider`; live balance display with Etherscan explorer links
- Wallet private keys stored locally, never transmitted; mnemonic discarded after key generation
- All async operations wrapped in try/catch — app never crashes silently
- Security headers: CSP (self + jsdelivr + esm.sh), X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy
- Receipt upload limited to 10 MB; event count capped at 5000 with graceful fallback
- No hardcoded secrets, API keys, or tokens
- No `eval()`, no `document.write()`, no inline event handlers
- `parseInt` with radix 10 everywhere

See [SECURITY.md](SECURITY.md) for full policy.

---

## License

MIT — see [LICENSE](LICENSE)

---

## Evidence Bundle (for judges)

What to look for when evaluating PE\u00d1A:

1. **On-chain tx hashes** — EIP-3009 `transferWithAuthorization` signatures are real, verifiable on-chain
2. **Real cryptography, tested** — `npm test` runs 88 tests across 5 suites including genuine EIP-191 and EIP-3009 signatures verified against signer addresses (`tests/signing.test.js`). The wallet layer is real ethers.js cryptography, not a mock.
3. **P2P sync** — open two browser tabs, create a contribution in one, watch it appear in the other via BroadcastChannel
4. **Receipt OCR** — upload a receipt image, watch Tesseract.js extract payee/amount/category locally
5. **NL queries** — type "saldo", "transporte", "quien contribuy\u00f3 m\u00e1s" and get answers from the local ledger
6. **M-of-N approval** — create a proposal, approve it from multiple members, watch the threshold gate execution
7. **Reproducibility** — `git clone && npm install && npm test` — 88 passing tests across 5 suites; `npx serve .` to run the app
