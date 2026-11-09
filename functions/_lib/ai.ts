// Structured output from Claude through one tool. Forcing a tool (tool_choice "tool"/"any") is not
// supported by every model, so we ask for it, nudge once or twice, and fall back to JSON in the text.
import type { Env } from './auth';

type Tool = { name: string; description: string; input_schema: any };

export async function askForTool(env: Env, wsId: string, o: { system: string; prompt: string; tool: Tool; max_tokens?: number; extraTools?: any[]; attachments?: any[] }): Promise<any> {
  if (!env.ANTHROPIC_API_KEY) throw new Error('AI is not configured: add ANTHROPIC_API_KEY');
  const ask = `${o.prompt}\n\nWhen done, call the ${o.tool.name} tool with the result.`;
  // attachments (e.g. a PDF as a document block) go before the instructions
  const messages: any[] = [{ role: 'user', content: o.attachments?.length ? [...o.attachments, { type: 'text', text: ask }] : ask }];
  let tools: any[] = [...(o.extraTools || []), o.tool];
  let tokens = 0;
  const log = () =>
    env.DB.prepare('INSERT INTO usage (id, workspace_id, provider, units, created_at) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), wsId, 'anthropic', tokens, Date.now()).run();
  for (let i = 0; i < 4; i++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: env.MODEL || 'claude-sonnet-5-5', max_tokens: o.max_tokens || 4000, system: o.system, tools, messages }),
    });
    if (!res.ok) {
      const err = await res.text();
      // a server tool (e.g. web search) may be disabled for the org: retry without it
      if (tools.length > 1 && /web_search/i.test(err)) { tools = [o.tool]; continue; }
      throw new Error(`AI error ${res.status}: ${err.slice(0, 200)}`);
    }
    const out: any = await res.json();
    tokens += (out.usage?.input_tokens || 0) + (out.usage?.output_tokens || 0);
    const use = (out.content || []).find((b: any) => b.type === 'tool_use' && b.name === o.tool.name);
    if (use) { await log(); return use.input || {}; }
    messages.push({ role: 'assistant', content: out.content });
    if (out.stop_reason === 'pause_turn') continue;
    const text = (out.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (json && i >= 1) { try { await log(); return JSON.parse(json); } catch { /* keep nudging */ } }
    messages.push({ role: 'user', content: `Now call ${o.tool.name} with the result.` });
  }
  await log();
  throw new Error('AI did not return a result, try again');
}
