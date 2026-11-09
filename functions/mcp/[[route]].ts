// Cloudflare Pages entry for the AI connector links: /mcp/<secret> (the Worker entry routes them in worker/index.ts).
import { handleMcp } from '../_lib/mcp';
import type { Env } from '../_lib/auth';

export const onRequest = (ctx: { request: Request; env: Env }) => handleMcp(ctx.request, ctx.env);
