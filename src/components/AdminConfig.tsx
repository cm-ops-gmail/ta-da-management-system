import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { api } from "../api.js";
import { Card, Notice, Spinner } from "./ui.js";

const DESCRIPTIONS: Record<string, string> = {
  Config: "Rates, limits and thresholds. Change a value here and every calculation follows it immediately.",
  BandPolicy: "Per-band transport lists (male / female), outside-city weekday & weekend rates, accommodation limit, flight and car-pool eligibility.",
  Lists: "Every dropdown in one place, keyed by ListName — City (Extra1 = Inside/Outside), TransportMode (Extra1 = scope, Extra2 = needs receipt), WorkedAt, DualWorkstation, PaymentMethod, DocumentType, and ApprovalStage (Extra1 = step order, Extra2 = role).",
  Employees: "People, bands, line managers and roles. Roles are comma-separated: employee, manager, admin, finance, hr, dept_head.",
};

export default function AdminConfig() {
  const [tabs, setTabs] = useState<string[]>([]);
  const [headers, setHeaders] = useState<Record<string, string[]>>({});
  const [data, setData] = useState<Record<string, Record<string, string>[]>>({});
  const [active, setActive] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.adminTabs()
      .then((r) => {
        setTabs(r.tabs);
        setHeaders(r.headers);
        setData(r.data);
        setActive(r.tabs[0]);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const cols = useMemo(() => (active ? headers[active] || [] : []), [active, headers]);
  const rows = active ? data[active] || [] : [];

  function edit(rowIdx: number, col: string, value: string) {
    setData((d) => ({
      ...d,
      [active]: (d[active] || []).map((r, i) => (i === rowIdx ? { ...r, [col]: value } : r)),
    }));
  }

  async function save() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      // `_row` is bookkeeping from the read layer and is not a real column.
      const clean = rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? ""])));
      await api.saveTab(active, clean);
      setMessage(`${active} saved — the new policy is live.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner />;
  if (error && !tabs.length) return <Notice tone="error" items={[error]} />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-slate-900 sm:text-xl">Admin configuration</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every policy value lives here and in the Google Sheet — changing a rate, a band rule or the approval
          chain never needs a code change.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => { setActive(t); setMessage(""); setError(""); }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              active === t ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <Card
        title={active}
        subtitle={DESCRIPTIONS[active]}
        actions={
          <div className="flex gap-2">
            <button
              className="btn-ghost !px-3 !py-1.5 text-xs"
              onClick={() =>
                setData((d) => ({
                  ...d,
                  [active]: [...(d[active] || []), Object.fromEntries(cols.map((c) => [c, ""]))],
                }))
              }
            >
              <Plus size={14} /> Add row
            </button>
            <button className="btn-primary !px-3 !py-1.5 text-xs" onClick={save} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
            </button>
          </div>
        }
      >
        {message && <div className="mb-4"><Notice tone="info" items={[message]} /></div>}
        {error && <div className="mb-4"><Notice tone="error" items={[error]} /></div>}

        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {cols.map((c) => (
                  <th key={c} className="px-2 py-2 font-semibold whitespace-nowrap">{c}</th>
                ))}
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, i) => (
                <tr key={i}>
                  {cols.map((c) => (
                    <td key={c} className="px-1 py-1">
                      <input
                        className="field !px-2 !py-1.5 text-xs"
                        value={row[c] ?? ""}
                        onChange={(e) => edit(i, c, e.target.value)}
                      />
                    </td>
                  ))}
                  <td className="px-1 py-1">
                    <button
                      onClick={() => setData((d) => ({ ...d, [active]: (d[active] || []).filter((_, idx) => idx !== i) }))}
                      className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!rows.length && <p className="py-8 text-center text-sm text-slate-400">No rows. Add one to get started.</p>}
      </Card>
    </div>
  );
}
