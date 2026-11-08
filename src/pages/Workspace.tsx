import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { api } from '../api';
import { Logo } from '../components/ui';
import Chat from '../components/Chat';
import Overview from '../tabs/Overview';
import Memory from '../tabs/Memory';
import Assets from '../tabs/Assets';
import Market from '../tabs/Market';
import Settings from '../tabs/Settings';

export type WsInfo = {
  id: string; slug: string; name: string; client_url: string | null; category_description: string | null;
  stage?: string; settings?: any; access: { level: string; isAgency: boolean };
};

type Tab = { id: string; label: string; icon: string; soon?: boolean };
const GROUPS: { title?: string; tabs: Tab[] }[] = [
  { tabs: [{ id: 'overview', label: 'Overview', icon: '⌂' }] },
  { title: 'Project', tabs: [{ id: 'memory', label: 'Memory', icon: '▤' }, { id: 'assets', label: 'Assets', icon: '◫' }] },
  { title: 'Intelligence', tabs: [{ id: 'market', label: 'Market map', icon: '◈' }, { id: 'lenses', label: 'Lenses', icon: '◐', soon: true }, { id: 'monitor', label: 'Monitor', icon: '∿', soon: true }] },
  { title: 'Brand OS', tabs: [{ id: 'guide', label: 'Online guide', icon: '❏', soon: true }, { id: 'generate', label: 'Generate', icon: '✦', soon: true }] },
];
const TABS: Tab[] = [...GROUPS.flatMap((g) => g.tabs), { id: 'settings', label: 'Settings', icon: '⚙' }];

export default function Workspace() {
  const { slug = '' } = useParams();
  const loc = useLocation();
  const nav = useNavigate();
  const tab = loc.pathname.split('/')[2] || 'overview';
  const focus = new URLSearchParams(loc.search).get('focus') || undefined;
  const [info, setInfo] = useState<WsInfo | null>(null);
  const [err, setErr] = useState('');
  const [chatOpen, setChatOpen] = useState(true);
  const [rev, setRev] = useState(0);

  useEffect(() => {
    api<WsInfo>(`/w/${slug}/info`).then(setInfo).catch((e) => setErr(e.message));
  }, [slug, rev]);

  if (err) return <div className="p-10 text-muted">{err}</div>;
  if (!info) return <div className="p-10 text-muted">Loading…</div>;
  const hidden: string[] = (!info.access.isAgency && info.settings?.hidden_tabs) || [];

  const go = (t: string, f?: string) => nav(`/${slug}/${t}${f ? `?focus=${encodeURIComponent(f)}` : ''}`);
  const reload = () => setRev((r) => r + 1);

  return (
    <div className="flex h-full">
      <aside className="flex w-[232px] shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex h-12 items-center border-b border-line px-5"><Link to="/"><Logo /></Link></div>
        <Link to="/" className="mx-2 my-3 flex items-center justify-between rounded-md border border-line px-3 py-2 hover:bg-panel-2">
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium">{info.name}</div>
            {info.access.isAgency && info.stage && <div className="text-[11px] text-muted">{info.stage}</div>}
          </div>
          {info.access.isAgency && <span className="text-[11px] text-muted">⇅</span>}
        </Link>
        <nav className="flex-1 space-y-5 overflow-y-auto px-2">
          {GROUPS.map((g, gi) => {
            const tabs = g.tabs.filter((t) => !hidden.includes(t.id) && (info.access.isAgency || !t.soon));
            if (!tabs.length) return null;
            return (
              <div key={gi}>
                {g.title && <div className="px-3 pb-1 text-[11px] font-medium text-muted">{g.title}</div>}
                {tabs.map((t) => (
                  <button key={t.id} disabled={t.soon} onClick={() => go(t.id)} className={`flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-[13px] transition disabled:cursor-default ${tab === t.id ? 'bg-panel-2 font-medium text-text shadow-[inset_2px_0_0_var(--mb-brand)]' : 'text-muted hover:bg-panel-2 hover:text-text'}`}>
                    <span className="w-4 text-center text-[12px] opacity-70">{t.icon}</span>
                    <span className="flex-1">{t.label}</span>
                    {t.soon && <span className="rounded border border-line px-1.5 text-[10px] text-muted">soon</span>}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="border-t border-line px-2 py-2">
          {!hidden.includes('settings') && (
            <button onClick={() => go('settings')} className={`flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-[13px] ${tab === 'settings' ? 'bg-panel-2 font-medium shadow-[inset_2px_0_0_var(--mb-brand)]' : 'text-muted hover:bg-panel-2 hover:text-text'}`}>
              <span className="w-4 text-center text-[12px] opacity-70">⚙</span>Settings
            </button>
          )}
          <div className="px-3 pt-2 text-[11px] text-muted">{info.access.isAgency ? 'Agency' : 'Client'} · {info.access.level.replace('_', ' ')}</div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 flex h-12 items-center justify-between border-b border-line bg-ink/85 px-8 backdrop-blur">
          <div className="text-[13px] text-muted">{info.name} <span className="px-1">/</span> <span className="text-text">{TABS.find((t) => t.id === tab)?.label}</span></div>
          {!chatOpen && <button onClick={() => setChatOpen(true)} className="brand-dot rounded-full px-3 py-1 text-[12px] font-medium text-brand-ink hover:brightness-95">✦ Ask AI</button>}
        </div>
        <div className="px-8 py-8">
          {tab === 'overview' && <Overview info={info} reload={reload} />}
          {tab === 'market' && <Market info={info} focus={focus} />}
          {tab === 'memory' && <Memory info={info} focus={focus} />}
          {tab === 'assets' && <Assets info={info} />}
          {tab === 'settings' && <Settings info={info} reload={reload} />}
        </div>
      </main>

      {chatOpen && <Chat slug={slug} name={info.name} onClose={() => setChatOpen(false)} onAction={(a) => a.type === 'navigate' && go(a.tab, a.focus)} />}
    </div>
  );
}
