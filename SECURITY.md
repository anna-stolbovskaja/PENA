# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. Do not open a public issue
2. Email the maintainers directly
3. Include a clear description and reproduction steps
4. Allow reasonable time for a fix before public disclosure

## Security Measures

### Input Validation
- All user-provided text is HTML-escaped before rendering (`escapeHtml()`)
- Numeric inputs parsed with `parseInt(value, 10)` — radix always specified
- No `eval()`, `Function()`, or `document.write()` anywhere in the codebase
- No inline event handlers in HTML — all events bound via `addEventListener`

### Wallet Security
- Private keys generated locally via `ethers.Wallet.createRandom()`
- Keys stored in browser `localStorage` — never transmitted to any server
- All signing operations (EIP-191, EIP-3009) performed locally
- No third-party API calls for wallet operations

### P2P Security
- BroadcastChannel scoped to same origin
- WebRTC connections use STUN servers only (no TURN credentials embedded)
- Peer messages validated before processing
- Unknown event types ignored (forward compatibility)

### Data Handling
- Receipt images processed locally by Tesseract.js, never uploaded
- Natural language queries processed locally, no external API calls
- Notes stored in localStorage, never synced or transmitted
- No analytics, no tracking, no telemetry

### HTTP Security Headers
- `X-Content-Type-Options: nosniff` — prevents MIME type sniffing
- `X-Frame-Options: DENY` — prevents clickjacking
- `Referrer-Policy: strict-origin-when-cross-origin` — limits referrer leakage

### Error Handling
- Every async function wrapped in try/catch
- Global `error` and `unhandledrejection` event listeners
- App renders error message with reload button instead of crashing
- Failed operations show user-friendly toast notifications

### Dependencies
- ethers.js v6 — loaded from esm.sh CDN, verified ESM module
- Tesseract.js v5 — loaded from esm.sh CDN, runs in Web Worker
- Tailwind CSS v4 — loaded from jsDelivr CDN with SRI integrity hash
- No other runtime dependencies

## Scope

This security policy covers the PEÑA web application source code in this repository. It does not cover:
- Third-party CDN services (esm.sh, jsDelivr)
- Browser localStorage security (browser-managed)
- WebRTC STUN server infrastructure (Google public STUN)
