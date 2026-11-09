// Cloudflare Workers entry (static assets + API). /api/* runs the Hono app, /mcp/* the MCP connector; everything else is the React app.
import app from '../functions/_lib/app';
import type { Env } from '../functions/_lib/auth';
import { handleMcp } from '../functions/_lib/mcp';

export default {
  fetch(req: Request, env: Env & { ASSETS: Fetcher }, ctx: ExecutionContext) {
    const { pathname } = new URL(req.url);
    if (pathname.startsWith('/api/')) return app.fetch(req, env, ctx);
    // MCP connector links: /mcp/<secret>
    if (pathname.startsWith('/mcp/')) return handleMcp(req, env);
    return env.ASSETS.fetch(req);
  },
};
