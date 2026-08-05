import { useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { LoginButton, useTenMSAuth } from "@tenminuteschool/auth-admin-react";
import { api, setToken } from "../api.js";
import { CLIENT_ID, REDIRECT_URI } from "../lib/auth.js";
import type { SessionUser } from "../../shared/types.js";

/**
 * Sign-in is "Login with 10 Minute School".
 *
 * The SDK gets us a verified session; the app session comes from matching that
 * account's email against the Employees sheet, which is where band, department,
 * roles and line manager actually live.
 */
export default function Login({ onSignedIn }: { onSignedIn: (user: SessionUser) => void }) {
  const { auth, refresh } = useTenMSAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showRedirectHint, setShowRedirectHint] = useState(false);
  const [passwordAllowed, setPasswordAllowed] = useState(false);

  useEffect(() => {
    api.authMethods().then((m) => setPasswordAllowed(m.password)).catch(() => {});
  }, []);

  async function finish(accessToken: string) {
    const { token, user } = await api.tenmsLogin(accessToken);
    setToken(token);
    onSignedIn(user);
  }

  if (!CLIENT_ID) {
    return (
      <Shell>
        <div className="card p-6 text-sm">
          <p className="font-semibold text-rose-700">Sign-in is not configured.</p>
          <p className="mt-2 text-slate-600">
            Set <code className="rounded bg-slate-100 px-1">VITE_TENMS_CLIENT_ID</code> and restart, so the
            app knows which 10 Minute School client to authenticate against.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="card space-y-5 p-6">
        <div>
          <h2 className="text-sm font-bold text-slate-800">Sign in to continue</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Use your 10 Minute School account. We match its email against the Employees sheet and sign you
            in with your own band, department and role.
          </p>
        </div>

        <div className="flex justify-center">
          <LoginButton
            clientId={CLIENT_ID}
            redirectUri={REDIRECT_URI}
            methods={["google"]}
            size="large"
            text="Continue with 10 Minute School"
            onSuccess={async (response) => {
              setBusy(true);
              setError("");
              try {
                // Persist the provider session, then tell the provider context
                // about it — it does not observe storage on its own.
                const session = await auth.handleLoginSuccess(response);
                refresh();
                // The server re-verifies this token with the provider before
                // trusting any email, then hands back our own app session.
                await finish(session.accessToken);
              } catch (err) {
                setError((err as Error).message);
                setBusy(false);
              }
            }}
            onError={(err) => {
              setError(err.message || "Sign-in did not complete.");
              // The usual cause of a failed authorize step is this app's origin
              // not being on the client's allow-list, which is invisible from
              // here — so always offer the address that needs registering.
              setShowRedirectHint(true);
              setBusy(false);
            }}
          />
        </div>

        {busy && (
          <p className="flex items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 size={15} className="animate-spin" /> Matching your account…
          </p>
        )}

        {error && (
          <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm leading-relaxed text-rose-700">{error}</div>
        )}

        {showRedirectHint && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
            <p className="font-semibold">If the popup showed an error, this address is probably not registered.</p>
            <p className="mt-1.5">
              Ask the 10 Minute School auth team to add this exact redirect URI to the client:
            </p>
            <code className="mt-1.5 block break-all rounded bg-white/70 px-2 py-1 font-mono">{REDIRECT_URI}</code>
          </div>
        )}

        {passwordAllowed && <PasswordFallback onDone={onSignedIn} />}

        <p className="text-center text-xs leading-relaxed text-slate-400">
          Not able to get in? Your work email has to exist in the{" "}
          <span className="font-semibold text-slate-500">Employees</span> tab of the Google Sheet first.
        </p>
      </div>
    </Shell>
  );
}

/**
 * Development-only way in, shown only when the server reports that password
 * sign-in is switched on. It stays hidden — and the endpoint stays closed — on
 * any deployment that does not set ALLOW_PASSWORD_LOGIN.
 */
function PasswordFallback({ onDone }: { onDone: (user: SessionUser) => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 text-xs font-semibold text-slate-400 hover:text-slate-600"
      >
        <KeyRound size={13} /> Use a password instead (development only)
      </button>
    );
  }

  return (
    <form
      className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const { token, user } = await api.login(email, password);
          setToken(token);
          onDone(user);
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Development sign-in</p>
      <input
        className="field"
        type="email"
        autoComplete="username"
        placeholder="you@10ms.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        className="field"
        type="password"
        autoComplete="current-password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <button className="btn-ghost w-full" disabled={busy}>
        {busy && <Loader2 size={14} className="animate-spin" />} Sign in
      </button>
    </form>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-slate-900 via-brand-700 to-brand-600 p-4 sm:p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center text-white">
          {/* The mark is dark, so it sits on a light tile against the gradient. */}
          <div className="mx-auto mb-4 flex size-16 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-white/25">
            <img src="/logo.png" alt="10 Minute School" width={64} height={64} className="size-16 object-contain" />
          </div>
          <h1 className="text-lg font-bold sm:text-xl">Transportation Allowance & Per-Diem</h1>
          <p className="mt-1 text-sm text-white/70">PeopleOps · Travel & Claims</p>
        </div>
        {children}
      </div>
    </div>
  );
}
