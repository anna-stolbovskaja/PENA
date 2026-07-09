# Changelog

All notable changes to PEÑA will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Project structure: README, ARCHITECTURE, ROADMAP, JUDGE_MAP, EVIDENCE
- Core modules: ledger schema, reducer, WDK wallet stubs, QVAC parser stubs, P2P swarm
- Unit tests for ledger reducer and schema
- CI workflow (GitHub Actions)
- GitHub issue templates and PR template
- MIT license
- Contributing guide

## [0.1.0] - 2026-07-09

### Added
- Initial repository setup
- Architecture document with 4-layer design (UI → QVAC → Pears → WDK)
- Data model with Autobase event types
- Key flows: onboarding, contribution, spending (anti-fraud), transparency
