import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Logo } from '../components/ui';

// Visual-only sign-in screen for live demos. The real session is the agency one already in the browser.
export default function DemoLogin() {
  const { slug = '' } = useParams();
  const nav = useNavigate();
  const email = `demo@${slug}.com`;
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let i = 0;
    const t = setInterval(() => {
      i++;
      setTyped(email.slice(0, i));
      if (i >= email.length) clearInterval(t);
    }, 55);
    return () => clearInterval(t);
  }, [email]);

  return (
    <div className="grid-bg flex h-full items-center justify-center">
      <div className="w-[380px] rounded-2xl border border-line bg-panel p-8 shadow-2xl">
        <Logo />
        <h1 className="mt-8 text-xl font-semibold tracking-tight">Sign in to your workspace</h1>
        <div className="mt-6 space-y-3">
          <div className="rounded-md border border-line bg-panel-2 px-3 py-2 text-[13px]">{typed}<span className="animate-pulse">|</span></div>
          <div className="rounded-md border border-line bg-panel-2 px-3 py-2 text-[13px] text-muted">••••••••••</div>
        </div>
        <button
          onClick={() => { setBusy(true); setTimeout(() => nav(`/${slug}`), 900); }}
          className="mt-6 w-full rounded-md bg-accent py-2 text-[13px] font-medium text-ink"
        >
          {busy ? 'Signing in…' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
