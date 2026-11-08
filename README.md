# Metabrand OS

Internal workspace for Metabrand projects: CRM and project memory, assets, market map, AI chat. Each client gets access to their own project only.

Stack: Cloudflare Pages + Pages Functions (Hono), D1 (SQLite + FTS5), React + Vite + Tailwind. AI: Anthropic API, pay per use.

## Deploy (Cloudflare, free tier)

The repo deploys either as a Pages project or as a Worker. Pages is preferred while metabrand.digital DNS stays at GoDaddy: Pages accepts a plain CNAME from external DNS, Workers custom domains need the zone on Cloudflare.

### A. Pages (preferred)

1. Workers & Pages → Create application → "Looking to deploy Pages? Get started" → Import an existing Git repository → `metabrand-agency/metabrand-os`.
   Framework preset: None. Build command `npm run build`, output directory `dist`.
2. Storage & Databases → D1 → Create database `metabrand-os`.
3. Pages project → Settings → Bindings → Add → D1 database: variable name `DB`, database `metabrand-os`.
4. Settings → Variables and Secrets, each as **Secret**: `ANTHROPIC_API_KEY`, `SESSION_SECRET` (long random string), `ACCESS_CODE` (agency sign-in code, never given to clients); optional `MODEL` (default `claude-sonnet-5-5`).
5. Deployments → Retry deployment, so bindings and secrets apply.
6. Open `https://<project>.pages.dev/setup`, enter your email and `ACCESS_CODE`.
7. Custom domains → `app.metabrand.digital`; in GoDaddy DNS add CNAME `app` → `<project>.pages.dev`.

### B. Worker (the dashboard's default "Import a repository" flow)

1. Build command `npm run build`, deploy command `npx wrangler deploy` (uses `wrangler.jsonc`). The D1 database is created automatically on the first deploy.
2. Worker → Settings → Variables and Secrets: the same three secrets as above.
3. Open `https://metabrand-os.<account>.workers.dev/setup`.
4. Custom domain: Worker → Settings → Domains & Routes; requires metabrand.digital DNS on Cloudflare.

## Access model

- Agency (org members) sign in with their email + `ACCESS_CODE` and see every project.
- Clients are added in a project's Settings → Client access. Each gets a personal code (shown once). They see only that project, only items marked as shared, and published research. Stage, contacts, internal notes and usage are never shown to clients.

## Local development

```
npm install
printf 'SESSION_SECRET=dev\nACCESS_CODE=dev\n' > .dev.vars
npm run build && npx wrangler dev        # Worker mode, http://localhost:8787
# or: npx wrangler pages dev dist --d1=DB  # Pages mode, http://localhost:8788
```

`db/schema.sql` is the schema; after changing it run `npm run gen:schema`. Tables are created automatically on first request.

Market map data can be replaced from the Market map tab (agency only → Data (JSON)).
