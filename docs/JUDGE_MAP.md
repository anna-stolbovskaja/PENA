# PEÑA — Judge Map

> Maps each Tether Developers Cup judging criterion to concrete evidence in the repo.

| Criterion (1–5) | What we deliver | Where to see it |
|---|---|---|
| **Technical ambition** | Multi-writer P2P ledger (Autobase) + M-of-N gasless smart account (ERC-4337) | `src/p2p/autobase-ledger.js`, `src/wdk/wallet.js` |
| **User experience** | Transparent audit feed, simple proposal cards with approve/reject, balance display | UI layer (Day 5) |
| **Real-world use** | Treasurer fraud — real pain of real fan organizations (peñas, ultras, fan clubs) | README § Problem |
| **Creativity** | P2P transparent treasury without trusted operator — zero hosting, offline-capable | README § Solution, Architecture doc |
| **Real use of track** | WDK load-bearing (core wallet) + Pears genuine (server would kill the thesis) + QVAC honest light (receipt parsing + NL queries) | `docs/ARCHITECTURE.md` § Track Alignment |

## Track Combination Justification

The hackathon explicitly calls track combinations "impressive". PEÑA uses all three:

- **WDK** — the treasury IS an ERC-4337 smart account. Without WDK, no money layer.
- **Pears** — the ledger IS an Autobase multi-writer log. A server would defeat the "trust without operator" thesis.
- **QVAC** — receipt parsing and NL queries run on-device. Not decoration: it turns paper receipts into structured audit data without a server.

## Evidence Bundle

1. **On-chain tx-hashes** — verifiable on testnet block explorer
2. **2-device sync screencast** — P2P ledger replication without server
3. **Receipt parsing demo** — photo → structured data via QVAC VLM
4. **NL query demo** — "how much on buses?" → answer from local ledger
