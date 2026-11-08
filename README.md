# Metabrand OS

Internal workspace for Metabrand projects: CRM and project memory, assets, market map, AI chat. Each client gets access to their own project only.

Stack: Cloudflare Pages + Pages Functions (Hono), D1 (SQLite + FTS5), React + Vite + Tailwind. AI: Anthropic API, pay per use.

## Deploy (Cloudflare, free tier)

1. Workers & Pages → Create → Pages → Connect to Git → `metabrand-agency/metabrand-os`.
   Framework preset: none. Build command `npm run build`, output directory `dist`.
2. Storage & Databases → D1 → Create database `metabrand-os`.
3. Pages project → Settings → Bindings → Add → D1 database: variable name `DB`, database `metabrand-os`.
4. Pages project → Settings → Variables and Secrets → add as **Secret**:
   - `ANTHROPIC_API_KEY`: from console.anthropic.com → API Keys
   - `SESSION_SECRET`: any long random string
   - `ACCESS_CODE`: the agency sign-in code (never give it to clients)
   - optional `MODEL` (default `claude-sonnet-5-5`)
5. Deployments → Retry deployment (so bindings and secrets apply).
6. Open `https://<project>.pages.dev/setup`, enter your email and `ACCESS_CODE`. This creates the Metabrand org and the SuperPlane demo project.
7. Custom domain: Pages project → Custom domains → `app.metabrand.digital`; then in GoDaddy DNS add a CNAME `app` → `<project>.pages.dev`.

## Access model

- Agency (org members) sign in with their email + `ACCESS_CODE` and see every project.
- Clients are added in a project's Settings → Client access. Each gets a personal code (shown once). They see only that project, only items marked as shared, and published research. Stage, contacts, internal notes and usage are never shown to clients.

## Local development

```
npm install
printf 'SESSION_SECRET=dev\nACCESS_CODE=dev\n' > .dev.vars
npm run build && npx wrangler pages dev dist --d1=DB   # http://localhost:8788
```

`db/schema.sql` is the schema; after changing it run `npm run gen:schema`. Tables are created automatically on first request.

Market map data can be replaced from the Market map tab (agency only → Data (JSON)).
