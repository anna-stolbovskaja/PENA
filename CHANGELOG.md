# Changelog

All notable changes to PEÑA are documented here.
Dates are in UTC. Public commit history is the source of truth.

## [1.0.0] — 2026-07-09

### Added
- Collective self-custody wallet (WDK) — ethers.js v6, EIP-3009 transferWithAuthorization signing, ERC-4337 smart account structure, M-of-N approval threshold
- P2P ledger sync (Pears) — append-only event log, BroadcastChannel + WebRTC DataChannel, QR code invite sharing, zero server
- On-device intelligence (QVAC) — Tesseract.js receipt OCR (Spanish + English), natural language query engine, automatic expense categorization
- Transparent audit feed — immutable log of all treasury activity
- Spending proposals with M-of-N cryptographic approval signatures
- Balance dashboard — animated SVG charts: category breakdown, spending trends, member contributions
- Match schedule, results history, form guide, venue information
- Expense splitter, contribution target calculator, treasury health score
- Sortable tables, exportable reports
- PWA — installable, offline-capable, responsive design
- Guided tour for first-time users
- 51 unit tests (ledger state machine, WDK utilities, QVAC query engine, real EIP-191 + EIP-3009 signing)
- CI pipeline (GitHub Actions) — tests, lint, secret scanning
- Security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy)
- MIT license

### Security
- All user input HTML-escaped via `escapeHtml()` / `escapeText()`
- No `eval()`, `document.write()`, or inline event handlers
- No hardcoded secrets, API keys, or tokens
- `parseInt` with radix 10 everywhere
- All async operations wrapped in try/catch
- Wallet private keys in localStorage, never transmitted
