# OSS Launch Checklist

Use this checklist to run the system locally or deploy it as an open-source instance where users bring their own API keys and can contribute.

**Launch approach**: The app is hosted at the current live site. Anyone can **download** the repo, **contribute** (PRs, issues), or use **BYOK** (bring your own Gemini key) so the host never needs to provide API keys. If there’s enough demand later, Stripe and shared API keys can be added; for now the focus is OSS-first.

## 1. Try It Locally (Quick Run)

**Backend**

```bash
cp env.example .env
# Edit .env: set GOOGLE_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
npm install
npm run api:run
```

API runs at `http://localhost:3000`. Health: `GET /health`.

**Frontend**

```bash
cd frontend
cp ../env.example .env   # or create frontend/.env
# Set VITE_API_URL=http://localhost:3000, VITE_USE_MOCK=false
# Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (same Supabase project)
npm install
npm run dev
```

Open `http://localhost:5173`. Sign in (Supabase Auth), pick a workspace, then use **Run** → **Search arXiv** to test the pipeline.

**Database**

- PostgreSQL (e.g. Supabase). Run migrations in `src/db/migrations/` in order (Supabase SQL editor or `npm run migrate` if wired).
- See README “Database Migrations” and `npm run migrations:sql` for the list.

**Verify migrations**

- In Supabase SQL editor: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('tenants','tenant_settings','tenant_users','pipeline_jobs','papers','nodes','edges');` — all seven should exist.
- If you use the Supabase MCP: `list_tables` and confirm `tenants`, `tenant_settings`, `pipeline_jobs`, `papers`, `nodes`, `edges`, `tenant_users` (and optionally `usage_events`, `entity_aliases`, `entity_links`) are present with the expected columns.

## 2. Bring Your Own Keys (BYOK)

The app supports tenant-level “bring your own key” so each workspace can use its own Gemini key.

- **Backend**: Set `ENCRYPTION_KEY` in `.env` (required to store encrypted keys). Use a stable 32-byte hex value in production.
- **Tenant settings**: In the UI (Settings) or via API, set execution mode to “Bring your own key” and submit a Google/Gemini API key. It is stored encrypted in `tenant_settings.api_key_encrypted`.
- **Pipeline**: When `execution_mode === 'byo_key'`, the pipeline uses the decrypted tenant key instead of the server `GOOGLE_API_KEY`. Server key remains the fallback for tenants that do not set a key.

So for a full OSS launch: document in README that users can use **GOOGLE_API_KEY** for a single-tenant/server key, or **BYOK** per tenant via Settings.

## 3. Required Environment (Summary)

| Variable | Purpose |
|----------|---------|
| `GOOGLE_API_KEY` | Gemini API (LLM + embeddings). Fallback when tenant has no BYOK. |
| `SUPABASE_URL` | Supabase project URL. |
| `SUPABASE_ANON_KEY` | Validate JWTs (sign-in). |
| `SUPABASE_SERVICE_ROLE_KEY` | Tenant resolution, tenant_users, DB if using Supabase client. |
| `ENCRYPTION_KEY` | Encrypt tenant BYOK; required if using BYOK in production. |
| `API_PORT`, `CORS_ORIGIN` | API port and allowed frontend origins. |

Frontend: `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; `VITE_USE_MOCK=false` for real API.

Optional: `SEMANTIC_SCHOLAR_API_KEY` (corpus scripts), model overrides (e.g. `INGESTION_MODEL`), rate limits (`PIPELINE_RATE_LIMIT_PER_MINUTE`).

## 4. What Else to Launch “Fully” as OSS Today

- **README**
  - Add a “Quick start” that points to this checklist and `env.example`.
  - Mention BYOK (Settings → execution mode → add API key) and that arXiv search + Run are wired to the real pipeline.

- **CONTRIBUTING.md**
  - How to open issues and PRs, run tests, and what to update (docs, types, tests when changing APIs or behavior).

- **License**
  - Already MIT; keep LICENSE and any “Third-party licenses” notice up to date if you add deps.

- **Public repo**
  - Push to GitHub/GitLab; turn on Issues (and optionally Discussions). Add repo URL to README.

- **CI (optional but recommended)**
  - Run `npm run build` and `npm test` on PRs. No secrets needed for unit tests; integration/e2e can be optional or use mock env.

- **Security**
  - Do not commit `.env` or real keys. `.gitignore` should include `.env` and `frontend/.env`. Document that users must create their own `.env` from `env.example`.

- **API surface**
  - Search (including `/api/search/arxiv`) and pipeline endpoints are documented in `src/api/README.md`. Keep that file in sync when adding or changing routes.

Once the repo is public, README and CONTRIBUTING are in place, and BYOK + env are documented, you can announce the OSS launch and accept contributions (see CONTRIBUTING.md). Hosted billing (Stripe) and shared API keys are out of scope for the initial OSS launch; add them later if demand justifies it.
