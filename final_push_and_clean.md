# Final Push and Clean Checklist

This checklist converts the full app review into focused development rounds.

## Locked Decisions

- [x] `demo` user/account is read-only to prevent token-spend actions.
- [x] Non-demo authenticated users retain full functionality.
- [ ] Open question (from prior review): finalize behavior for unauthenticated access on tenant-scoped routes.
- [ ] Recommended default for the open question: require authentication for all tenant-scoped routes and return `401` for anonymous requests.

## Round 1: Security and Tenant Isolation (Highest Priority)

- [ ] Enforce auth on all tenant-scoped routes that currently rely on `requireTenant` only.
- [ ] Apply strict tenant filtering to direct service/database queries (search, papers, stats, and any remaining endpoints).
- [ ] Add explicit RBAC checks for write/mutation routes (`review`, `settings`, pipeline execution, etc.).
- [ ] Block demo/read-only users from any token-consuming operations server-side (not just UI).
- [ ] Replace encryption fallback key behavior: require `ENCRYPTION_KEY` in non-dev environments.
- [ ] Harden URL ingestion against SSRF/resource abuse:
- [ ] Allow only `http/https`.
- [ ] Deny private/internal IP ranges and localhost.
- [ ] Add fetch timeout and max download size.
- [ ] Restrict content-types to expected document formats.
- [ ] Return safe, clear error responses for blocked URLs.

### Round 1 Exit Criteria

- [ ] Cross-tenant reads/writes are impossible through API tests.
- [ ] Demo user cannot trigger pipeline or other metered actions.
- [ ] Startup fails in production without valid encryption key.
- [ ] SSRF test cases are rejected consistently.

## Round 2: Test Coverage for Regressions

- [ ] Add multi-tenant regression tests for all sensitive endpoints.
- [ ] Add auth + role tests (`demo/read-only` vs `member/admin`).
- [ ] Add ingestion security tests (blocked hosts, size/time limits, invalid schemes).
- [ ] Add service-layer tests for query filter safety (especially search filter composition).
- [ ] Add CI gate so these tests must pass before deploy.

### Round 2 Exit Criteria

- [ ] New tests fail on intentionally vulnerable code and pass on fixed code.
- [ ] CI enforces these suites for main branch merges.

## Round 3: Performance and Cost Efficiency

- [ ] Refactor graph edge dedupe from O(n^2) checks to set/hash-based membership.
- [ ] Replace pipeline entity-link cycle N+1 checks with batched query strategy.
- [ ] Upgrade in-memory limiter path to shared/distributed limiter for multi-instance deploys.
- [ ] Add lightweight profiling benchmark scripts for graph and pipeline hot paths.

### Round 3 Exit Criteria

- [ ] Graph generation latency reduced at representative dataset sizes.
- [ ] Pipeline DB round-trips reduced measurably during entity-link stage.
- [ ] Rate limiting behavior remains consistent across multiple app instances.

## Round 4: Frontend + DX Cleanup

- [ ] Remove or gate noisy production console logging.
- [ ] Keep auth-token handling consistent with your security model (document current localStorage decision or migrate).
- [ ] Resolve bundle warning items (large chunk split strategy, mock import path hygiene).
- [ ] Consolidate duplicate/overlapping route registration patterns.
- [ ] Tighten TS/Jest configuration where currently permissive.

### Round 4 Exit Criteria

- [ ] Frontend build is warning-free (or warnings are documented and accepted).
- [ ] Auth and route architecture are documented and internally consistent.

## Suggested Execution Order

- [ ] Complete Round 1 before any feature additions.
- [ ] Land Round 2 tests immediately after each Round 1 fix area.
- [ ] Tackle Round 3 only after security and test baselines are stable.
- [ ] Finish with Round 4 cleanup and documentation updates.

## Delivery Tracking

- [ ] Create one PR per round (or two PRs for Round 1 if scope is too large).
- [ ] Include a short risk note in each PR: tenant impact, auth impact, token-cost impact.
- [ ] Add release notes for any behavior changes affecting demo or tenant access.
