import { useEffect, useMemo, useState } from "react";
import { Coins, FileText, Printer, Scissors, Wallet } from "lucide-react";
import { api, type RequestListItem } from "../api.js";
import type { Policy, SessionUser } from "../../shared/types.js";
import { cfgStr } from "../../shared/policy.js";
import { Card, Empty, Money, Notice, Spinner } from "./ui.js";

/**
 * What the money did, for Administration, HR and Finance.
 *
 * Everything is worked out from the claims already on the page, so a filter
 * changes the whole report at once and nothing has to be fetched again.
 */

/** Which date a claim is counted against — the three ways people ask. */
const BASIS = {
  submitted: { label: "Submitted", of: (r: RequestListItem) => (r.submittedAt || r.createdAt || "").slice(0, 10) },
  travel: { label: "Travel date", of: (r: RequestListItem) => r.toDate || r.fromDate || "" },
  paid: { label: "Payment date", of: (r: RequestListItem) => r.paymentDate || "" },
} as const;

type Basis = keyof typeof BASIS;

const PAID_STATUSES = ["paid", "completed"];

export default function Reports({
  policy, user, onOpen,
}: {
  policy: Policy;
  user: SessionUser;
  onOpen: (id: string) => void;
}) {
  const [rows, setRows] = useState<RequestListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [basis, setBasis] = useState<Basis>("submitted");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [department, setDepartment] = useState("");
  const currency = cfgStr(policy, "CURRENCY", "BDT");

  useEffect(() => {
    api.requests("everything")
      .then((r) => setRows(r.requests))
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const departments = useMemo(
    () => [...new Set(rows.map((r) => r.department).filter(Boolean))].sort(),
    [rows],
  );

  const claims = useMemo(() => {
    const on = BASIS[basis].of;
    return rows.filter((r) => {
      if (department && r.department !== department) return false;
      const date = on(r);
      // A claim with no date on the chosen basis has not reached that stage —
      // an unpaid claim has no payment date — so a date filter excludes it.
      if ((from || to) && !date) return false;
      if (from && date < from) return false;
      if (to && date > to) return false;
      return true;
    });
  }, [rows, basis, from, to, department]);

  const totals = useMemo(() => {
    const claimed = claims.reduce((s, r) => s + r.totalClaim, 0);
    const disbursed = claims
      .filter((r) => PAID_STATUSES.includes(r.status))
      .reduce((s, r) => s + (r.paidAmount || r.finalPayable), 0);
    // What approvers took off: only claims where someone set a different figure.
    const adjusted = claims
      .filter((r) => r.approvedAmount > 0)
      .reduce((s, r) => s + (r.totalClaim - r.approvedAmount), 0);
    return { count: claims.length, claimed, disbursed, adjusted };
  }, [claims]);

  const topTeams = useMemo(() => {
    const by = new Map<string, { claimed: number; count: number }>();
    for (const r of claims) {
      const key = r.department || "Unassigned";
      const t = by.get(key) || { claimed: 0, count: 0 };
      t.claimed += r.totalClaim;
      t.count += 1;
      by.set(key, t);
    }
    return [...by.entries()]
      .map(([name, t]) => ({ name, ...t }))
      .sort((a, b) => b.claimed - a.claimed)
      .slice(0, 5);
  }, [claims]);

  if (loading) return <Spinner />;
  if (error) return <Notice tone="error" items={[error]} />;

  const period = from || to ? `${from || "the beginning"} to ${to || "today"}` : "all time";
  const biggest = topTeams[0]?.claimed || 0;

  const cards = [
    { label: "Total requests", value: String(totals.count), icon: FileText, tone: "text-slate-600 bg-slate-100" },
    { label: "Total claimed", money: totals.claimed, icon: Coins, tone: "text-brand-600 bg-brand-50" },
    { label: "Total disbursed", money: totals.disbursed, icon: Wallet, tone: "text-emerald-600 bg-emerald-50" },
    { label: "Total adjusted", money: totals.adjusted, icon: Scissors, tone: "text-amber-600 bg-amber-50" },
  ];

  return (
    <div className="space-y-5 print:space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900 sm:text-xl">Claims report</h1>
          <p className="mt-1 text-sm text-slate-500">
            {BASIS[basis].label.toLowerCase()} · {period}
            {department ? ` · ${department}` : " · all departments"}
          </p>
        </div>
        {/* The browser's own print dialogue saves a PDF — no plugin, and the
            page is laid out for paper rather than screenshotted. */}
        <button className="btn-ghost print:hidden" onClick={() => window.print()}>
          <Printer size={16} /> Download PDF
        </button>
      </div>

      <Card title="Filters" className="print:hidden">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="label">Count claims by</span>
            <select className="field" value={basis} onChange={(e) => setBasis(e.target.value as Basis)}>
              {Object.entries(BASIS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">From</span>
            <input type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">To</span>
            <input type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Department</span>
            <select className="field" value={department} onChange={(e) => setDepartment(e.target.value)}>
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
        </div>
        {(from || to || department || basis !== "submitted") && (
          <button
            className="mt-4 text-xs font-semibold text-brand-600 hover:underline"
            onClick={() => { setFrom(""); setTo(""); setDepartment(""); setBasis("submitted"); }}
          >
            Clear filters
          </button>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        {cards.map(({ label, value, money, icon: Icon, tone }) => (
          <div key={label} className="card p-4">
            <div className={`mb-3 flex size-8 items-center justify-center rounded-lg ${tone}`}>
              <Icon size={16} />
            </div>
            <p className="text-xl font-bold tabular-nums text-slate-900 sm:text-2xl">
              {value ?? <Money value={money ?? 0} currency={currency} />}
            </p>
            <p className="mt-0.5 text-xs font-medium text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      <Card
        title="Top 5 teams by claim value"
        subtitle={department ? `Filtered to ${department}, so only one team can appear.` : "Who is claiming the most over this period."}
      >
        {!topTeams.length ? (
          <Empty title="Nothing in this period" hint="Widen the dates or clear the department filter." />
        ) : (
          <ol className="space-y-3">
            {topTeams.map((t, i) => (
              <li key={t.name}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-medium text-slate-800">
                    <span className="mr-2 inline-block w-4 text-xs font-bold tabular-nums text-slate-400">{i + 1}</span>
                    {t.name}
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-slate-900">
                    <Money value={t.claimed} currency={currency} />
                    <span className="ml-2 text-xs font-normal text-slate-400">{t.count} claim(s)</span>
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-chart-1"
                    style={{ width: `${biggest ? Math.max(2, (t.claimed / biggest) * 100) : 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card title="Claims in this report" subtitle={`${claims.length} claim(s), newest first.`}>
        {!claims.length ? (
          <Empty title="Nothing matches these filters" hint="Widen the dates or clear the department." />
        ) : (
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-2 font-semibold">Request</th>
                  <th className="px-2 py-2 font-semibold">Employee</th>
                  <th className="px-2 py-2 font-semibold">Department</th>
                  <th className="px-2 py-2 font-semibold">{BASIS[basis].label}</th>
                  <th className="px-2 py-2 font-semibold">Status</th>
                  <th className="px-2 py-2 text-right font-semibold">Claimed</th>
                  <th className="px-2 py-2 text-right font-semibold">Approved</th>
                  <th className="px-2 py-2 text-right font-semibold">Paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {claims.map((r) => (
                  <tr
                    key={r.requestId}
                    onClick={() => onOpen(r.requestId)}
                    className="cursor-pointer transition hover:bg-slate-50 print:cursor-auto"
                  >
                    <td className="whitespace-nowrap px-2 py-2 font-mono text-xs text-slate-600">{r.requestId}</td>
                    <td className="px-2 py-2 text-slate-800">{r.employeeName}</td>
                    <td className="px-2 py-2 text-slate-500">{r.department}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-slate-500">{BASIS[basis].of(r) || "—"}</td>
                    <td className="px-2 py-2 text-slate-500">{r.status.replace(/_/g, " ")}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-800">
                      <Money value={r.totalClaim} currency={currency} />
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-amber-700">
                      {r.approvedAmount > 0 ? <Money value={r.approvedAmount} currency={currency} /> : "—"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-emerald-700">
                      {PAID_STATUSES.includes(r.status)
                        ? <Money value={r.paidAmount || r.finalPayable} currency={currency} />
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="hidden text-xs text-slate-400 print:block">
        Generated {new Date().toLocaleString()} by {user.name}.
      </p>
    </div>
  );
}
