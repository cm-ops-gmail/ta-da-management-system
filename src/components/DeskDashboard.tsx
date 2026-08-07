import { useEffect, useState } from "react";
import { Banknote, CheckCheck, HandCoins, Inbox, Timer, Wallet } from "lucide-react";
import { api, type DeskSummary } from "../api.js";
import type { Policy, RequestRecord, SessionUser } from "../../shared/types.js";
import { cfgStr } from "../../shared/policy.js";
import { Card, Empty, Money, ProgressBar, Spinner, StatusBadge } from "./ui.js";

/**
 * The approver's home screen. Deliberately contains nothing about the
 * signed-in person's own claims — those live in the My Claims workspace.
 */
export default function DeskDashboard({
  user, policy, onOpen, onGoto,
}: {
  user: SessionUser;
  policy: Policy;
  onOpen: (id: string) => void;
  onGoto: (view: string) => void;
}) {
  const [desk, setDesk] = useState<DeskSummary | null>(null);
  const [pending, setPending] = useState<RequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const currency = cfgStr(policy, "CURRENCY", "BDT");

  useEffect(() => {
    api.requests("pending")
      .then((r) => {
        setDesk(r.desk);
        setPending(r.requests);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  // "user" is on everyone, so it says nothing about why this desk exists.
  // Being a line manager is derived from the roster, not a role.
  const LABELS: Record<string, string> = { admin: "Administration", finance: "Finance", hr: "HR" };
  const roleLabel = [
    ...user.roles.filter((r) => r !== "user").map((r) => LABELS[r] || r),
    ...(user.managesOthers ? ["Line Manager"] : []),
  ].join(" · ");

  const cards = [
    { label: "Waiting for you", value: desk?.pending ?? 0, icon: Inbox, tone: "text-amber-600 bg-amber-50", go: "desk-pending" },
    { label: "In the pipeline", value: desk?.inFlight ?? 0, icon: Timer, tone: "text-sky-600 bg-sky-50", go: "desk-all" },
    { label: "Awaiting payment", value: desk?.awaitingPayment ?? 0, icon: Banknote, tone: "text-indigo-600 bg-indigo-50", go: "desk-payments" },
    { label: "Open advances", value: desk?.advancesOpen ?? 0, icon: HandCoins, tone: "text-violet-600 bg-violet-50", go: "desk-advances" },
    { label: "Decided by you", value: desk?.processed ?? 0, icon: CheckCheck, tone: "text-emerald-600 bg-emerald-50", go: "desk-processed" },
    { label: "People's claims", value: desk?.count ?? 0, icon: Wallet, tone: "text-slate-600 bg-slate-100", go: "desk-all" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-bold text-slate-900 sm:text-xl">Approval desk</h1>
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-200">
            {roleLabel}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Other people's claims only. Your own claims are under <span className="font-semibold text-slate-600">My Claims</span>.
        </p>
      </div>

      {(desk?.pending ?? 0) > 0 && (
        <button
          onClick={() => onGoto("desk-pending")}
          className="flex w-full items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-left transition hover:bg-amber-100"
        >
          <Inbox size={18} className="shrink-0 text-amber-600" />
          <span className="text-sm font-semibold text-amber-900">
            {desk!.pending} request{desk!.pending > 1 ? "s" : ""} need your decision — worth{" "}
            <Money value={desk!.pendingValue} currency={currency} />
          </span>
        </button>
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-6">
        {cards.map(({ label, value, icon: Icon, tone, go }) => (
          <button key={label} onClick={() => onGoto(go)} className="card p-3.5 text-left transition hover:border-brand-200 sm:p-4">
            <div className={`mb-3 flex size-8 items-center justify-center rounded-lg ${tone}`}>
              <Icon size={16} />
            </div>
            <p className="text-xl font-bold tabular-nums text-slate-900 sm:text-2xl">{value}</p>
            <p className="mt-0.5 text-xs font-medium text-slate-500">{label}</p>
          </button>
        ))}
      </div>

      <Card
        title="Waiting for your decision"
        subtitle="Only requests currently sitting at your desk."
        actions={
          <button className="-mr-2 flex min-h-11 items-center px-2 text-xs font-semibold text-brand-600 hover:underline" onClick={() => onGoto("desk-pending")}>
            View all
          </button>
        }
      >
        {!pending.length ? (
          <Empty title="Your queue is clear" hint="Nothing is waiting on you right now." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {pending.slice(0, 8).map((r) => (
              <li key={r.requestId}>
                <button
                  onClick={() => onOpen(r.requestId)}
                  className="flex w-full flex-col gap-3 py-3 text-left transition hover:bg-slate-50 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-700">{r.requestId}</span>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="mt-1 truncate text-sm text-slate-600">
                      {r.employeeName} · Band {r.band} · {r.department}
                    </p>
                  </div>
                  <div className="w-full sm:w-48">
                    <ProgressBar status={r.status} />
                  </div>
                  <div className="text-sm font-semibold text-slate-800 sm:w-32 sm:text-right">
                    <Money value={r.finalPayable} currency={currency} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
