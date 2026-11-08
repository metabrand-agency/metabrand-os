import type { Env, Access } from './auth';

type Msg = { role: 'user' | 'assistant'; content: any };
export type ChatAction = { type: 'navigate'; tab: string; focus?: string };

const TOOLS = [
  {
    name: 'search_memory',
    description: 'Full-text search over the project memory: briefs, meeting transcripts, correspondence, proposals, research notes. Returns matching snippets with document titles.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'list_assets',
    description: 'List project assets: Figma files/frames, GitHub repos, videos, logos, websites. Optionally filter by kind.',
    input_schema: { type: 'object', properties: { kind: { type: 'string' } } },
  },
  {
    name: 'get_market_map',
    description: 'Get the competitor market map: companies with segment, overlap type (direct, angle, substitute, may_enter), tier, positioning claims, proof, funding, map coordinates and sources; plus strategic findings.',
    input_schema: { type: 'object', properties: { overlap: { type: 'string' }, tier: { type: 'number' } } },
  },
  {
    name: 'get_overview',
    description: 'Get the project overview: client, description, contacts, recent timeline.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'navigate',
    description: 'Open a tab in the interface for the user so they see the relevant view. Use after answering when a view helps. Tabs: market = competitor list and dossiers; lenses = perceptual matrices and findings. focus: for market, a company id or an overlap type (direct, angle, substitute, may_enter); for lenses, a lens id or company id; for memory, a search phrase.',
    input_schema: {
      type: 'object',
      properties: { tab: { type: 'string', enum: ['overview', 'memory', 'assets', 'market', 'lenses', 'settings'] }, focus: { type: 'string' } },
      required: ['tab'],
    },
  },
];

async function runTool(env: Env, ws: { id: string; name: string }, access: Access, name: string, input: any, actions: ChatAction[]): Promise<string> {
  const db = env.DB;
  const clientOnly = !access.isAgency;
  if (name === 'search_memory') {
    const q = String(input.query || '').replace(/["']/g, ' ').trim();
    if (!q) return 'Empty query.';
    const terms = q.split(/\s+/).filter(Boolean).map((t) => `"${t}"*`).join(' OR ');
    const rows = await db
      .prepare(
        `SELECT d.id, d.title, d.kind, snippet(documents_fts, 1, '«', '»', ' … ', 24) AS snip
         FROM documents_fts JOIN documents d ON d.rowid = documents_fts.rowid
         WHERE documents_fts MATCH ? AND d.workspace_id = ? ${clientOnly ? "AND d.visibility = 'client'" : ''}
         ORDER BY rank LIMIT 8`
      )
      .bind(terms, ws.id)
      .all();
    return rows.results.length ? JSON.stringify(rows.results) : 'No matches in project memory.';
  }
  if (name === 'list_assets') {
    const rows = await db
      .prepare(`SELECT id, kind, title, url, meta_json FROM assets WHERE workspace_id = ? ${input.kind ? 'AND kind = ?' : ''} ${clientOnly ? "AND visibility='client'" : ''} ORDER BY created_at DESC LIMIT 50`)
      .bind(...(input.kind ? [ws.id, input.kind] : [ws.id]))
      .all();
    return JSON.stringify(rows.results);
  }
  if (name === 'get_market_map') {
    const row = await db.prepare(`SELECT data_json, status FROM research WHERE workspace_id = ? AND kind = 'market_map'`).bind(ws.id).first<{ data_json: string; status: string }>();
    if (!row || (clientOnly && row.status !== 'published')) return 'No market map yet.';
    const data = JSON.parse(row.data_json);
    let companies = data.companies || [];
    if (input.overlap) companies = companies.filter((c: any) => c.overlap === input.overlap);
    if (input.tier) companies = companies.filter((c: any) => c.tier === input.tier);
    const lenses = (data.lenses || []).map((l: any) => ({ id: l.id, title: l.title, why: l.why, axes: l.axes, positions: l.positions }));
    return JSON.stringify({ client: data.client, axes: data.axes, companies, findings: data.findings, lenses });
  }
  if (name === 'get_overview') {
    const w = await db.prepare('SELECT name, client_url, category_description FROM workspaces WHERE id = ?').bind(ws.id).first();
    const contacts = await db.prepare('SELECT name, email, role FROM contacts WHERE workspace_id = ?').bind(ws.id).all();
    const acts = await db
      .prepare(`SELECT kind, title, happened_at FROM activities WHERE workspace_id = ? ${clientOnly ? "AND visibility='client'" : ''} ORDER BY happened_at DESC LIMIT 15`)
      .bind(ws.id)
      .all();
    return JSON.stringify({ workspace: w, contacts: clientOnly ? [] : contacts.results, timeline: acts.results });
  }
  if (name === 'navigate') {
    actions.push({ type: 'navigate', tab: input.tab, focus: input.focus });
    return `Opened tab ${input.tab}.`;
  }
  return 'Unknown tool.';
}

export async function chat(env: Env, ws: { id: string; name: string }, access: Access, messages: Msg[]) {
  if (!env.ANTHROPIC_API_KEY) return { text: 'AI is not configured yet: add ANTHROPIC_API_KEY in Cloudflare settings.', actions: [] };
  const model = env.MODEL || 'claude-sonnet-5-5';
  const system = `You are the assistant inside Metabrand OS, the brand-intelligence workspace of the branding agency Metabrand. Current project: ${ws.name}. The user is ${access.isAgency ? 'a Metabrand team member' : 'a client team member'}.
Answer in the user's language. Be concise and concrete, cite sources (URLs) when you use market data.
Format with light Markdown only: short paragraphs, '-' bullets, numbered lists, **bold** sparingly, links as [label](url). No tables, no code blocks, no headings above ###.
Use tools to ground every factual answer in project data; never invent competitors, numbers or quotes.
When the request is ambiguous and the answer depends on a choice (which competitors, which channel, which format), ask ONE short clarifying question and end the message with a line exactly in the form:
OPTIONS: first option | second option | third option
After answering, call navigate to open the most relevant tab when a view would help.`;

  const actions: ChatAction[] = [];
  const convo: Msg[] = messages.slice(-20);
  let inTok = 0, outTok = 0;
  for (let i = 0; i < 6; i++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 1500, system, tools: TOOLS, messages: convo }),
    });
    if (!res.ok) return { text: `AI error ${res.status}: ${(await res.text()).slice(0, 300)}`, actions };
    const data: any = await res.json();
    inTok += data.usage?.input_tokens || 0;
    outTok += data.usage?.output_tokens || 0;
    convo.push({ role: 'assistant', content: data.content });
    const uses = (data.content || []).filter((b: any) => b.type === 'tool_use');
    if (data.stop_reason !== 'tool_use' || !uses.length) {
      const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
      await env.DB.prepare('INSERT INTO usage (id, workspace_id, provider, units, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), ws.id, 'anthropic', inTok + outTok, Date.now())
        .run();
      return { text, actions };
    }
    const results = [];
    for (const u of uses) results.push({ type: 'tool_result', tool_use_id: u.id, content: await runTool(env, ws, access, u.name, u.input || {}, actions) });
    convo.push({ role: 'user', content: results });
  }
  return { text: 'Stopped after too many steps.', actions };
}
