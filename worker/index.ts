// Cloudflare Workers entry (static assets + API). /api/* runs the Hono app; everything else is the React app.
import app from '../functions/_lib/app';
import type { Env } from '../functions/_lib/auth';

export default {
  fetch(req: Request, env: Env & { ASSETS: Fetcher }, ctx: ExecutionContext) {
    const { pathname } = new URL(req.url);
    if (pathname.startsWith('/api/')) return app.fetch(req, env, ctx);
    return env.ASSETS.fetch(req);
  },
};
