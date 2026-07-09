# Contributing to PEÑA

## Development Setup

```bash
git clone https://github.com/anna-stolbovskaja/PENA.git
cd PENA
npm install
npm run dev
```

## Commit Conventions

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` new feature
- `fix:` bug fix
- `test:` test additions/changes
- `docs:` documentation only
- `refactor:` code change that neither fixes a bug nor adds a feature
- `chore:` build process, tooling, dependencies

## Branch Naming

- `feat/<short-description>` — new features
- `fix/<short-description>` — bug fixes
- `docs/<short-description>` — documentation

## Pull Requests

1. Create a feature branch from `main`
2. Make your changes with clear commit messages
3. Ensure tests pass: `npm test`
4. Open a PR with a description of what + why

## Code Style

- Functions ≤40 lines
- Business logic separated from framework code
- Type hints / TypeScript types everywhere
- No commented-out code in committed files
