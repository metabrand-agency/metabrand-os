import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import Markdown from './Markdown';

type Msg = { role: 'user' | 'assistant'; content: string };
type Action = { type: 'navigate'; tab: string; focus?: string };

const SUGGESTIONS = ['Who are the direct competitors and how do they position?', 'Which claims does everyone in the category make?', 'What did the client say about competitors in our meetings?', 'Show me all Figma and GitHub assets'];

function splitOptions(text: string): { body: string; options: string[] } {
  const m = text.match(/\n?OPTIONS:\s*(.+)\s*$/);
  if (!m) return { body: text, options: [] };
  return { body: text.slice(0, m.index).trim(), options: m[1].split('|').map((s) => s.trim()).filter(Boolean) };
}

export default function Chat({ slug, name, onAction, onClose }: { slug: string; name: string; onAction: (a: Action) => void; onClose: () => void }) {
  const key = `mos-chat-${slug}`;
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    try { return JSON.parse(sessionStorage.getItem(key) || '[]'); } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { sessionStorage.setItem(key, JSON.stringify(msgs)); } catch {}
    end.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const next = [...msgs, { role: 'user' as const, content: text }];
    setMsgs(next);
    setInput('');
    setBusy(true);
    try {
      const r = await api<{ text: string; actions: Action[] }>(`/w/${slug}/chat`, { body: { messages: next } });
      setMsgs([...next, { role: 'assistant', content: r.text || '…' }]);
      r.actions.forEach(onAction);
    } catch (e: any) {
      setMsgs([...next, { role: 'assistant', content: `Error: ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="flex w-[400px] shrink-0 flex-col border-l border-line bg-panel">
      <div className="flex h-12 items-center justify-between border-b border-line px-4">
        <div className="text-[13px] font-medium">{msgs.length ? 'Conversation' : 'New conversation'}</div>
        <div className="flex items-center gap-1">
          {msgs.length > 0 && <button title="Clear the conversation" onClick={() => setMsgs([])} className="rounded px-2 py-1 text-[12px] text-muted hover:bg-panel-2 hover:text-text">Clear</button>}
          <button title="Close" onClick={onClose} className="rounded px-2 py-1 text-[13px] text-muted hover:bg-panel-2 hover:text-text">✕</button>
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {!msgs.length && (
          <div>
            <div className="text-[20px] font-semibold leading-tight tracking-tight">Ask anything about {name}.</div>
            <p className="mt-2 text-[13px] text-muted">Market, competitors, meetings, assets. I'll open the right view for you.</p>
            <div className="mt-5 space-y-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="block w-full rounded-md border border-line px-3 py-2 text-left text-[13px] text-muted hover:border-muted hover:text-text">{s}</button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => {
          if (m.role === 'user') return <div key={i} className="anim-rise ml-8 rounded-md bg-panel-2 px-3 py-2 text-[13px]">{m.content}</div>;
          const { body, options } = splitOptions(m.content);
          const last = i === msgs.length - 1;
          return (
            <div key={i} className="anim-rise text-[13px] leading-relaxed">
              <Markdown text={body} />
              {last && options.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {options.map((o) => (
                    <button key={o} onClick={() => send(o)} className="rounded-full border border-line bg-panel-2 px-3 py-1 text-[12px] hover:border-muted">{o}</button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {busy && <div className="text-[12px] text-muted"><span className="animate-pulse">Working…</span></div>}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="border-t border-line p-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
          rows={3}
          placeholder="Ask, or tell me what to make…"
          className="w-full resize-none rounded-md border border-line bg-panel-2 px-3 py-2 text-[13px] outline-none placeholder:text-muted focus:border-muted"
        />
      </form>
    </aside>
  );
}
