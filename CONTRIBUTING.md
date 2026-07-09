# Contributing to PEÑA

## Development Setup

```bash
git clone https://github.com/anna-stolbovskaja/PENA.git
cd PENA
npx serve .
```

The app is a static site with zero build step. Open `index.html` in any browser.

## Architecture Overview

- `app.js` — Main application: state management, rendering, event binding
- `lib/ledger.js` — Event log, state reducer, HTML escaping utility
- `lib/wdk.js` — Wallet operations (ethers.js, EIP-3009, ERC-4337)
- `lib/qvac.js` — Receipt OCR (Tesseract.js), NL query engine
- `lib/p2p.js` — P2P sync (BroadcastChannel, WebRTC)
- `lib/ui.js` — UI components (modals, toasts, tour, charts, QR, tables)
- `lib/icons.js` — SVG icon library

## Code Style

- ES modules (`import`/`export`) — no bundler, no transpiler
- Functions under 40 lines where possible
- All user input escaped with `escapeHtml()` or `escapeText()`
- All `parseInt` calls include radix 10
- All async functions wrapped in try/catch
- No `eval()`, `document.write()`, or inline event handlers
- No hardcoded secrets, API keys, or tokens

## Commit Conventions

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation
- `refactor:` code restructuring
- `chore:` tooling, config

## Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make changes with clear commit messages
4. Test in a browser — verify no console errors
5. Open a PR with a description of what and why

## Testing

Automated tests cover the core logic (ledger state machine, WDK utilities, QVAC categorization):

```bash
npm test
```

88 tests across 5 suites (ledger, wdk, qvac, signing, e2e). Manual testing checklist for browser-only features:

- [ ] Open in Chrome and Firefox — no console errors
- [ ] Test on mobile viewport — bottom nav appears, no horizontal scroll
- [ ] Create a contribution — appears in audit feed
- [ ] Create a proposal — appears in proposals tab
- [ ] Approve a proposal — approval count increments
- [ ] Execute a proposal (after threshold) — balance decreases
- [ ] Open two tabs — peer count increases, events sync
- [ ] Upload a receipt image — OCR extracts data
- [ ] Run NL query — returns answer from ledger
- [ ] Export report — downloads text file
- [ ] Toggle demo/live mode — state resets correctly
- [ ] Add and delete notes — persists across reload
- [ ] Complete the tour — highlights each section

## License

By contributing, you agree that your contributions are licensed under the MIT License.
