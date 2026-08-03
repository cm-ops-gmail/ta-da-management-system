import { useState } from "react";
import { Loader2, Plane } from "lucide-react";
import { api, setToken } from "../api.js";
import type { SessionUser } from "../../shared/types.js";

export default function Login({ onSignedIn }: { onSignedIn: (user: SessionUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { token, user } = await api.login(email, password);
      setToken(token);
      onSignedIn(user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-slate-900 via-brand-700 to-brand-600 p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center text-white">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
            <Plane size={26} />
          </div>
          <h1 className="text-xl font-bold">Transportation Allowance & Per-Diem</h1>
          <p className="mt-1 text-sm text-white/70">PeopleOps · Travel & Claims</p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-6">
          <div>
            <label className="label">Work email</label>
            <input
              className="field"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@10ms.com"
              required
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              className="field"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

          <button className="btn-primary w-full" disabled={busy}>
            {busy && <Loader2 size={16} className="animate-spin" />} Sign in
          </button>

          <p className="text-center text-xs leading-relaxed text-slate-400">
            Accounts live in the <span className="font-semibold text-slate-500">Employees</span> tab of the
            Google Sheet. Seeded logins use password <span className="font-semibold text-slate-500">1234</span> —
            e.g. ariful@10ms.com (employee), tanvir@10ms.com (manager), admin@10ms.com,
            finance@10ms.com, hr@10ms.com.
          </p>
        </form>
      </div>
    </div>
  );
}
