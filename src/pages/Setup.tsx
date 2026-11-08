import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Btn, Input, Logo } from '../components/ui';

export default function Setup() {
  const nav = useNavigate();
  const [email, setEmail] = useState('info@metabrand.digital');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      await api('/setup', { body: { email, code } });
      nav('/');
    } catch (x: any) {
      setErr(x.message);
    }
  }

  return (
    <div className="grid-bg flex h-full items-center justify-center">
      <form onSubmit={submit} className="w-[400px] rounded-2xl border border-line bg-panel p-8">
        <Logo />
        <h1 className="mt-8 text-xl font-semibold tracking-tight">First-time setup</h1>
        <p className="mt-1 text-[13px] text-muted">Creates the Metabrand organisation, your admin account and the SuperPlane demo project.</p>
        <div className="mt-6 space-y-3">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input type="password" placeholder="Access code (ACCESS_CODE secret)" value={code} onChange={(e) => setCode(e.target.value)} required />
        </div>
        {err && <div className="mt-3 text-[12px] text-direct">{err}</div>}
        <div className="mt-6"><Btn kind="primary" type="submit">Set up</Btn></div>
      </form>
    </div>
  );
}
