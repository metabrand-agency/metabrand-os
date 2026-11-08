// Reads project memory (brief, calls, emails) and compares it with the competitor list:
// which competitors the client names, and how our researched list holds up against the brief.
import type { Env } from './auth';
import { askForTool } from './ai';

const TOOL = {
  name: 'save_review',
  description: 'Return competitors named by the client and a review of the current list.',
  input_schema: {
    type: 'object',
    properties: {
      named: {
        type: 'array',
        description: 'Companies the client names as competitors, alternatives or references they watch',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            url: { type: 'string', description: 'Website if stated or obvious, https://…' },
            existing_id: { type: 'string', description: 'id from the current list if it is the same company' },
            overlap: { type: 'string', enum: ['direct', 'angle', 'substitute', 'may_enter'] },
            quote: { type: 'string', description: 'Short quote (max 20 words) from the document' },
            doc: { type: 'string', description: 'Document title' },
          },
          required: ['name', 'quote'],
        },
      },
      review: {
        type: 'array',
        description: 'For companies in the current list that the client did NOT name',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            verdict: { type: 'string', enum: ['keep', 'indirect', 'drop'], description: 'keep = relevant as is; indirect = keep as adjacent/substitute; drop = not relevant to what the brief describes' },
            overlap: { type: 'string', enum: ['direct', 'angle', 'substitute', 'may_enter'] },
            reason: { type: 'string', description: 'One sentence grounded in the brief' },
          },
          required: ['id', 'verdict', 'reason'],
        },
      },
      summary: { type: 'string', description: 'Two sentences: how the client sees its competition vs our list' },
    },
    required: ['named', 'review'],
  },
};

export async function reviewAgainstMemory(env: Env, wsId: string, clientName: string, data: any) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('AI is not configured: add ANTHROPIC_API_KEY');
  const docs = await env.DB.prepare(
    `SELECT title, kind, text_content FROM documents WHERE workspace_id = ? AND text_content IS NOT NULL
     ORDER BY CASE kind WHEN 'brief' THEN 0 WHEN 'transcript' THEN 1 WHEN 'email_thread' THEN 2 ELSE 3 END, created_at DESC LIMIT 12`
  ).bind(wsId).all<{ title: string; kind: string; text_content: string }>();
  if (!docs.results.length) throw new Error('Memory is empty: add the brief or call notes first');
  let budget = 120_000;
  const text = docs.results.map((d) => {
    const t = d.text_content.slice(0, Math.max(0, budget));
    budget -= t.length;
    return `### ${d.title} (${d.kind})\n${t}`;
  }).join('\n\n');
  const list = (data.companies || []).map((c: any) => ({ id: c.id, name: c.name, url: c.url, overlap: c.overlap, segment: c.segment, hero: c.hero }));

  const r: any = await askForTool(env, wsId, {
    system: 'You are a brand strategist. Be literal: a company counts as named only if it appears in the documents. Ground every reason in what the client wrote. English.',
    prompt: `Client: ${clientName}.\n\n1) List every company the client names as a competitor, alternative, or reference they watch. Match to the current list by id when it is the same company.\n2) Review the rest of the current list against what the brief says about the client's market, buyer and product.\n\nCurrent competitor list (JSON):\n${JSON.stringify(list)}\n\nProject documents:\n${text}`,
    tool: TOOL,
    max_tokens: 6000,
  });
  const ids = new Set(list.map((c: any) => c.id));
  return {
    named: (r.named || []).map((n: any) => ({ ...n, existing_id: ids.has(n.existing_id) ? n.existing_id : undefined })),
    review: (r.review || []).filter((x: any) => ids.has(x.id)),
    summary: r.summary || '',
    docs: docs.results.map((d) => d.title),
  };
}
