import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { api } from '../api';
import { Favicon, Logo, ThemeSwitch } from '../components/ui';
import { Icon } from '../components/icons';
import Chat from '../components/Chat';
import Overview from '../tabs/Overview';
import Memory from '../tabs/Memory';
import Assets from '../tabs/Assets';
import Guide from '../tabs/Guide';
import Generate from '../tabs/Generate';
import Merch, { merchOf } from '../tabs/Merch';
import Competitors from '../tabs/Competitors';
import Lenses from '../tabs/Lenses';
import Visibility from '../tabs/Visibility';
import Monitor from '../tabs/Monitor';
import Settings from '../tabs/Settings';

export type WsInfo = {
  id: string; slug: string; name: string; client_url: string | null; category_description: string | null;
  stage?: string; settings?: any; access: { level: string; isAgency: boolean };
};

type Tab = { id: string; label: string; icon: string; soon?: boolean; children?: { id: string; label: string }[] };
const GROUPS: { title?: string; tabs: Tab[] }[] = [
  { tabs: [{ id: 'overview', label: 'Overview', icon: 'overview' }] },
  { title: 'Project', tabs: [{ id: 'memory', label: 'Memory', icon: 'memory' }, { id: 'competitors', label: 'Competitors', icon: 'competitors' }] },
  { title: 'Intelligence', tabs: [{ id: 'lenses', label: 'Lenses', icon: 'lenses', children: [{ id: 'maps', label: 'Market maps' }, { id: 'seo', label: 'SEO content gap' }, { id: 'branding', label: 'Competitor branding' }, { id: 'methods', label: 'Methodologies' }] }, { id: 'visibility', label: 'Brand Visibility', icon: 'visibility' }, { id: 'monitor', label: 'PR Monitor', icon: 'monitor' }] },
  { title: 'Brand OS', tabs: [{ id: 'assets', label: 'Assets', icon: 'assets' }, { id: 'guide', label: 'Online guide', icon: 'guide' }, { id: 'merch', label: 'Merch', icon: 'merch' }, { id: 'generate', label: 'Generate Covers', icon: 'generate' }] },
];
const TABS: Tab[] = [...GROUPS.flatMap((g) => g.tabs), { id: 'settings', label: 'Settings', icon: 'settings' }];

export default function Workspace() {
  const { slug = '' } = useParams();
  const loc = useLocation();
  const nav = useNavigate();
  const raw = loc.pathname.split('/')[2] || 'overview';
  const ALIAS: Record<string, string> = { market: 'competitors', radar: 'visibility' }; // old links
  const tab = ALIAS[raw] || raw;
  const sub = loc.pathname.split('/')[3] || '';
  const [openGroups, setOpenGroups] = useState<string[]>(['lenses']);
  const focus = new URLSearchParams(loc.search).get('focus') || undefined;
  const [info, setInfo] = useState<WsInfo | null>(null);
  const [err, setErr] = useState('');
  const [chatOpen, setChatOpen] = useState(true);
  const [rev, setRev] = useState(0);

  useEffect(() => {
    api<WsInfo>(`/w/${slug}/info`).then(setInfo).catch((e) => setErr(e.message));
  }, [slug, rev]);
  // brand tools on the client's own site (e.g. a generative art page), kept in the brand kit, shown in the sidebar
  const [tools, setTools] = useState<{ title: string; url: string }[]>([]);
  const [hasMerch, setHasMerch] = useState(false);
  useEffect(() => {
    api<{ data: any } | null>(`/w/${slug}/research/brand_kit`)
      .then((r) => { setTools(r?.data?.links || []); setHasMerch(!!merchOf(r?.data)?.slides?.length); })
      .catch(() => { setTools([]); setHasMerch(false); });
  }, [slug, rev, tab === 'assets']);

  if (err) return <div className="p-10 text-muted">{err}</div>;
  if (!info) return <div className="p-10 text-muted">Loading…</div>;
  const hidden: string[] = ((!info.access.isAgency && info.settings?.hidden_tabs) || []).map((t: string) => ALIAS[t] || t);

  const go = (t: string, f?: string) => nav(`/${slug}/${ALIAS[t] || t}${f ? `?focus=${encodeURIComponent(f)}` : ''}`);
  const reload = () => setRev((r) => r + 1);

  return (
    <div className="flex h-full">
      <aside className="flex w-[232px] shrink-0 flex-col border-r border-line bg-panel">
        {/* the project on top; Metabrand OS sits at the bottom with Settings */}
        <Link to="/" title={info.access.isAgency ? 'All projects' : undefined} className="flex h-12 shrink-0 items-center gap-2.5 border-b border-line px-5 hover:bg-panel-2">
          <Favicon url={info.client_url} name={info.name} size={22} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[13px] font-semibold tracking-tight">{info.name}</div>
            {info.access.isAgency && info.stage && <div className="text-[11px] text-muted">{info.stage}</div>}
          </div>
          {info.access.isAgency && <Icon name="switch" stroke={1.6} className="h-2 w-2 shrink-0 text-muted" />}
        </Link>
        <div className="h-3 shrink-0" />
        <nav className="flex-1 space-y-5 overflow-y-auto px-2">
          {GROUPS.map((g, gi) => {
            const tabs = g.tabs.filter((t) => !hidden.includes(t.id) && (info.access.isAgency || !t.soon) && (t.id !== 'merch' || hasMerch));
            if (!tabs.length) return null;
            return (
              <div key={gi}>
                {g.title && <div className="px-3 pb-1 text-[11px] font-medium text-muted">{g.title}</div>}
                {tabs.map((t) => {
                  const open = openGroups.includes(t.id);
                  const active = tab === t.id && !t.children;
                  return (
                    <div key={t.id}>
                      <button
                        disabled={t.soon}
                        onClick={() => (t.children ? setOpenGroups(open ? openGroups.filter((x) => x !== t.id) : [...openGroups, t.id]) : go(t.id))}
                        className={`flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-[13px] transition disabled:cursor-default ${active ? 'bg-panel-2 font-medium text-text' : tab === t.id ? 'text-text' : 'text-muted hover:bg-panel-2 hover:text-text'}`}
                      >
                        <Icon name={t.icon} className="h-4 w-4 shrink-0 opacity-80" />
                        <span className="flex-1">{t.label}</span>
                        {t.soon && <span className="rounded border border-line px-1.5 text-[10px] text-muted">soon</span>}
                        {t.children && <svg viewBox="0 0 16 16" className={`h-3 w-3 text-muted transition ${open ? '' : '-rotate-90'}`}><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                      </button>
                      {t.children && open && t.children.map((ch, i) => {
                        const on = tab === t.id && (sub === ch.id || (!sub && i === 0));
                        return (
                          <button key={ch.id} onClick={() => nav(`/${slug}/${t.id}/${ch.id}`)} className={`flex w-full items-center rounded-md py-1.5 pl-[42px] pr-3 text-left text-[13px] ${on ? 'bg-panel-2 font-medium text-text' : 'text-muted hover:bg-panel-2 hover:text-text'}`}>
                            {ch.label}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
                {g.title === 'Brand OS' && tools.map((l) => (
                  <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] text-muted transition hover:bg-panel-2 hover:text-text">
                    <Icon name="link" className="h-4 w-4 shrink-0 opacity-80" />
                    <span className="flex-1 truncate">{l.title}</span>
                  </a>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="border-t border-line px-2 py-2">
          {!hidden.includes('settings') && (
            <button onClick={() => go('settings')} className={`flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-[13px] ${tab === 'settings' ? 'bg-panel-2 font-medium' : 'text-muted hover:bg-panel-2 hover:text-text'}`}>
              <Icon name="settings" className="h-4 w-4 shrink-0 opacity-80" />Settings
            </button>
          )}
          <div className="px-3 pt-2 text-[11px] text-muted">{info.access.isAgency ? 'Agency' : 'Client'}, {info.access.level.replace('_', ' ')}</div>
          <div className="px-3 pt-2"><ThemeSwitch /></div>
          <Link to="/" className="mt-2 flex items-center border-t border-line px-3 pb-1 pt-3"><Logo /></Link>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 flex h-12 items-center justify-between border-b border-line bg-ink/85 px-8 backdrop-blur">
          <div className="text-[13px] text-muted"><Link to={`/${slug}/overview`} className="hover:text-text">{info.name}</Link> <span className="px-1">/</span> <Link to={`/${slug}/${tab}`} className="text-text hover:underline">{TABS.find((t) => t.id === tab)?.label}</Link>{tab === 'lenses' && <><span className="px-1">/</span><span className="text-text">{sub === 'seo' ? 'SEO content gap' : sub === 'branding' ? 'Competitor branding' : sub === 'methods' ? 'Methodologies' : 'Market maps'}</span></>}</div>
          {!chatOpen && <button onClick={() => setChatOpen(true)} className="brand-dot rounded-full px-3 py-1 text-[12px] font-medium text-brand-ink hover:brightness-95">✦ Ask AI</button>}
        </div>
        {tab === 'guide' && <Guide info={info} section={sub || focus || undefined} />}
        <div className={tab === 'guide' ? 'hidden' : 'px-8 py-8'}>
          {tab === 'overview' && <Overview info={info} reload={reload} />}
          {tab === 'competitors' && <Competitors info={info} focus={focus} />}
          {tab === 'lenses' && <Lenses info={info} focus={focus} view={sub === 'seo' || ['seo', 'content gap', 'keywords'].includes((focus || '').toLowerCase()) ? 'seo' : sub === 'branding' || ['branding', 'colours', 'colors', 'fonts'].includes((focus || '').toLowerCase()) ? 'branding' : sub === 'methods' || ['methods', 'methodologies'].includes((focus || '').toLowerCase()) ? 'methods' : 'maps'} />}
          {tab === 'visibility' && <Visibility info={info} />}
          {tab === 'monitor' && <Monitor info={info} />}
          {tab === 'memory' && <Memory info={info} focus={focus} />}
          {tab === 'assets' && <Assets info={info} />}
          {tab === 'merch' && <Merch info={info} />}
          {tab === 'generate' && <Generate info={info} />}
          {tab === 'settings' && <Settings info={info} reload={reload} />}
        </div>
      </main>

      {chatOpen && <Chat slug={slug} name={info.name} onClose={() => setChatOpen(false)} onAction={(a) => a.type === 'navigate' && go(a.tab, a.focus)} />}
    </div>
  );
}
