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
- Self-custody wallet per member via ethers.js
- ERC-4337 smart account as treasury
- Gasless USDt transfers via EIP-3009 `transferWithAuthorization`
- M-of-N approval threshold for all spending
- Cryptographic signatures on every action

### P2P Ledger (Pears)
- Append-only event log with deterministic state rebuild
- BroadcastChannel for instant same-browser sync
- WebRTC DataChannel for cross-device P2P connections
- QR code invite sharing
- Zero hosting, zero server costs, works offline

### On-Device Intelligence (QVAC)
- Receipt OCR via Tesseract.js (Spanish + English, runs in browser)
- Natural language queries against local ledger
- Automatic expense categorization
- No data leaves the device — no API calls, no cloud

### Additional Features
- **Audit Feed** — transparent, immutable log of all treasury activity
- **Proposals** — M-of-N spending approvals with receipt attachment
- **Balance Dashboard** — visual charts: category breakdown, spending trends, member contributions
- **Reports** — sortable tables, exportable reports, detailed statistics
- **Notes** — locally stored treasury notes
- **PWA** — installable on mobile, works offline, responsive design
- **Demo & Live modes** — explore with sample data or start fresh
- **Guided tour** — interactive walkthrough for first-time users

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Wallet | ethers.js v6 | Key generation, EIP-3009 signing, ERC-4337 smart account |
| P2P | BroadcastChannel + WebRTC | Serverless ledger sync across devices |
| OCR | Tesseract.js 5.x | On-device receipt text extraction |
| NL Query | Local query engine | Natural language questions over ledger state |
| Frontend | Vanilla JS + Tailwind CSS | Zero build step, instant load |
| Icons | Custom SVG library | No icon font dependencies |
| Charts | Custom SVG charts | No chart library, animated visualizations |
| PWA | manifest.json | Installable, offline-capable, app-like experience |

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

---

## Project Structure

```
PENA/
├── index.html          — Entry point, meta tags, PWA manifest link, structured data
├── styles.css          — Responsive styles, animations, bottom nav, modals
├── app.js              — Application logic, 7 tabs, state management
├── manifest.json       — PWA manifest
├── icon.svg            — Vector icon
├── icon-512.png        — App icon (512x512, transparent)
├── icon-192.png        — App icon (192x192)
├── icon-180.png        — Apple touch icon
├── favicon.png         — Favicon (32x32)
├── lib/
│   ├── ledger.js       — Append-only event log, deterministic state rebuild, HTML escaping
│   ├── wdk.js          — Wallet operations: ethers.js, EIP-3009, ERC-4337, signature verification
│   ├── qvac.js         — Receipt OCR (Tesseract.js), NL query engine, expense categorization
│   ├── p2p.js          — P2P sync: BroadcastChannel, WebRTC DataChannel, peer discovery
│   ├── ui.js           — UI components: modals, toasts, tour, charts, QR, sortable tables
│   └── icons.js        — SVG icon library (50+ icons, zero dependencies)
├── vercel.json         — Deployment config, security headers
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
| Ledger events | In-memory + P2P sync | Via Hypercore in production |
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
- Wallet private keys stored in localStorage, never transmitted
- All async operations wrapped in try/catch — app never crashes silently
- Security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`
- No hardcoded secrets, API keys, or tokens
- No `eval()`, no `document.write()`, no inline event handlers
- `parseInt` with radix 10 everywhere

See [SECURITY.md](SECURITY.md) for full policy.

---

## License

MIT — see [LICENSE](LICENSE)
