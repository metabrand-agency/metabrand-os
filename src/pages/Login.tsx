import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Btn, Input, Logo } from '../components/ui';

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    api<{ setup: boolean }>('/setup/status').then((s) => !s.setup && nav('/setup')).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      await api('/auth/login', { body: { email, code } });
      nav('/');
    } catch (x: any) {
      setErr(x.message);
    }
  }

  return (
    <div className="grid-bg flex h-full items-center justify-center">
      <form onSubmit={submit} className="w-[360px] rounded-2xl border border-line bg-panel p-8 shadow-sm">
        <Logo />
        <h1 className="mt-8 text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-[13px] text-muted">Project workspace. Use the code you received from Metabrand.</p>
        <div className="mt-6 space-y-3">
          <Input type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input type="password" placeholder="Your code" value={code} onChange={(e) => setCode(e.target.value)} required />
        </div>
        {err && <div className="mt-3 text-[12px] text-direct">{err}</div>}
        <div className="mt-6"><Btn kind="primary" type="submit">Continue</Btn></div>
      </form>
    </div>
  );
}
