# PEÑA 🏟️

> **Transparent self-custody treasury for football fan groups.**
> Collective wallet + P2P ledger visible to every member. No treasurer fraud, no opaque cash.

## What is this?

Fan groups handle real money — tifo, travel, buses, charity, dues. Almost always it's cash + one treasurer = opacity and abuse. PEÑA replaces that with a collective self-custody USD₮ wallet and a transparent P2P ledger where every transaction is visible to all members and confirmed by M-of-N.

## Features

- **Transparent audit feed** — every contribution and expense is visible to all members
- **M-of-N spending approvals** — proposals require multiple signatures before execution
- **Gasless USD₮ transfers** — ERC-4337 smart account with paymaster
- **P2P synchronization** — ledger replicates across devices without a server
- **Receipt OCR** — photo of a receipt → structured data (payee, amount, category)
- **Natural language queries** — "how much on buses?" → instant answer from local ledger

## Tech

| Component | Technology |
|---|---|
| Wallet | ethers.js v6 — EIP-3009 transferWithAuthorization, ERC-4337 smart account |
| P2P sync | BroadcastChannel (same-browser) + WebRTC DataChannel (cross-device) |
| Receipt OCR | Tesseract.js — on-device, Spanish + English |
| NL queries | Local query engine over the ledger state |
| Frontend | Vanilla JS + Tailwind CSS, zero build step |

## Run locally

```bash
git clone https://github.com/anna-stolbovskaja/PENA.git
cd PENA
npx serve .
```

Or open `index.html` directly in a browser.

## Structure

```
PENA/
├── index.html      — entry point
├── styles.css      — styles
├── app.js          — application logic (UI + state)
├── lib/
│   ├── ledger.js   — append-only event log + deterministic state rebuild
│   ├── wdk.js      — wallet operations (ethers.js, EIP-3009 signing)
│   ├── qvac.js     — receipt OCR (Tesseract.js) + NL query engine
│   └── p2p.js      — P2P sync (BroadcastChannel + WebRTC)
└── LICENSE
```

## License

MIT
