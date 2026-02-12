# Contributing

We welcome contributions. This project is open source (MIT); you can use it with your own keys and submit improvements via pull requests.

## How to Submit Updates

1. **Fork the repo** and create a branch from `main` (or the default branch).
2. **Make your changes** (see guidelines below).
3. **Run tests**: `npm test` (and `npm run build` for the monorepo; run frontend build if you changed the frontend).
4. **Open a pull request** with a clear description of what changed and why. Link any related issues.

## Before You Submit

- **Backend**: From the repo root, `npm run build` and `npm test`. Fix any failing tests.
- **Frontend**: From `frontend/`, `npm run build` and fix lint/type errors.
- **Docs**: If you add or change API endpoints, update `src/api/README.md`. If you change setup or env, update `env.example` and `docs/LAUNCH_OSS_CHECKLIST.md` as needed.
- **OSS boundary**: Keep OSS vs hosted behavior consistent with `docs/OSS_BOUNDARY.md`. New features should be clearly in one camp and documented.

## What We Care About

- **Backward compatibility**: Avoid breaking existing API contracts or env vars without a clear migration path.
- **Tests**: New behavior should have tests where practical; don’t leave existing tests broken.
- **No secrets**: Never commit `.env`, API keys, or tokens. Use `env.example` for variable names and docs for how to obtain keys.

## Code and Conventions

- TypeScript throughout; follow existing patterns in the file you’re editing.
- Comments only where they help a human understand non-obvious behavior.
- Prefer production-ready code: no TODOs or stubs in merged PRs unless explicitly scoped and tracked.

## Questions

Open an issue for bugs, feature ideas, or questions about the OSS boundary or contribution process.
