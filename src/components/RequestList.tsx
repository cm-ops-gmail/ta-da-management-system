import { useEffect, useMemo, useState } from "react";
import { ChevronRight, RotateCcw } from "lucide-react";
import { api, type RequestListItem } from "../api.js";
import { STATUS_LABEL } from "../../shared/types.js";
import { Card, Empty, Money, ProgressBar, SearchInput, Spinner, StatusBadge } from "./ui.js";

export default function RequestList({
  scope, title, subtitle, onOpen, refreshKey, showEmployee = true, showFilters = false,
}: {
  scope: string;
  title: string;
  subtitle: string;
  onOpen: (id: string) => void;
  refreshKey?: number;
  /** Hidden on personal lists, where every row is the same person. */
  showEmployee?: boolean;
  /** The full filter bar — for the oversight register, not personal lists. */
  showFilters?: boolean;
}) {
  const [rows, setRows] = useState<RequestListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [department, setDepartment] = useState("");
  const [travelScope, setTravelScope] = useState("");
  const [waiting, setWaiting] = useState("");

  useEffect(() => {
    setLoading(true);
    api.requests(scope)
      .then((r) => setRows(r.requests))
      .finally(() => setLoading(false));
  }, [scope, refreshKey]);

  // Filter options come from the data itself, so a new department in the sheet
  // shows up here without any code change.
  const departments = useMemo(
    () => [...new Set(rows.map((r) => r.department).filter(Boolean))].sort(),
    [rows],
  );
  const waitingOptions = useMemo(
    () => [...new Set(rows.map((r) => r.waitingOn).filter(Boolean))].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status && r.status !== status) return false;
      if (department && r.department !== department) return false;
      if (travelScope && r.scope !== travelScope) return false;
      if (waiting && r.waitingOn !== waiting) return false;
      if (!needle) return true;
      return [r.requestId, r.employeeName, r.employeeId, r.email, r.city, r.destination, r.purpose, r.department]
        .some((v) => String(v || "").toLowerCase().includes(needle));
    });
  }, [rows, q, status, department, travelScope, waiting]);

  const activeFilters = [status, department, travelScope, waiting, q.trim()].filter(Boolean).length;
  const totalValue = filtered.reduce((s, r) => s + r.finalPayable, 0);

  function reset() {
    setQ("");
    setStatus("");
    setDepartment("");
    setTravelScope("");
    setWaiting("");
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <h1 className="text-lg font-bold text-slate-900 sm:text-xl">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>

      <Card>
        <div className="mb-4 space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
            <SearchInput
              className="flex-1"
              value={q}
              onChange={setQ}
              placeholder={showFilters ? "Name, employee ID, request ID, city or purpose" : "Search ID, city or purpose"}
            />
            <select className="field sm:w-52" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {showFilters && (
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
              <select className="field sm:flex-1" value={department} onChange={(e) => setDepartment(e.target.value)}>
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <select className="field sm:flex-1" value={waiting} onChange={(e) => setWaiting(e.target.value)}>
                <option value="">Any stage</option>
                {waitingOptions.map((w) => (
                  <option key={w} value={w}>Waiting on: {w}</option>
                ))}
              </select>
              <select className="field sm:w-44" value={travelScope} onChange={(e) => setTravelScope(e.target.value)}>
                <option value="">Inside & outside</option>
                <option value="inside">Inside city</option>
                <option value="outside">Outside city</option>
              </select>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>
              <span className="font-semibold text-slate-700">{filtered.length}</span> of {rows.length} claim(s)
            </span>
            <span>·</span>
            <span>
              Total payable <span className="font-semibold text-slate-700"><Money value={totalValue} /></span>
            </span>
            {activeFilters > 0 && (
              <button onClick={reset} className="ml-auto inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline">
                <RotateCcw size={12} /> Clear filters
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <Spinner />
        ) : !filtered.length ? (
          <Empty
            title={rows.length ? "Nothing matches these filters" : "Nothing here yet"}
            hint={rows.length ? "Try clearing a filter." : "Requests will appear as they are created."}
          />
        ) : (
          <>
            {/* Phones: one tappable card per claim — tables don't fit a phone. */}
            <ul className="space-y-2 md:hidden">
              {filtered.map((r) => (
                <li key={r.requestId}>
                  <button
                    onClick={() => onOpen(r.requestId)}
                    className="w-full rounded-xl border border-slate-200 p-3 text-left transition active:bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-mono text-xs font-semibold text-slate-700">{r.requestId}</span>
                        {r.isMine && <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">YOU</span>}
                        {showEmployee && (
                          <span className="mt-0.5 block truncate text-sm font-medium text-slate-800">
                            {r.employeeName} <span className="text-xs font-normal text-slate-400">{r.employeeId}</span>
                          </span>
                        )}
                        <span className="mt-0.5 block truncate text-xs text-slate-500">
                          {r.department} · {r.scope === "inside" ? "Inside" : "Outside"} · {r.city} · {r.fromDate}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className="text-sm font-bold text-slate-800">
                          <Money value={r.finalPayable} />
                        </span>
                        <ChevronRight size={16} className="text-slate-300" />
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-center gap-3">
                      <StatusBadge status={r.status} />
                      <div className="min-w-0 flex-1">
                        <ProgressBar status={r.status} />
                      </div>
                    </div>
                    {r.waitingOn && (
                      <p className="mt-1.5 text-xs text-slate-500">Waiting on: <span className="font-medium text-slate-700">{r.waitingOn}</span></p>
                    )}
                  </button>
                </li>
              ))}
            </ul>

            {/* Tablet and up: the full table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Request</th>
                    {showEmployee && <th className="px-3 py-2.5 font-semibold">Employee</th>}
                    <th className="px-3 py-2.5 font-semibold">Travel</th>
                    <th className="px-3 py-2.5 font-semibold">Status</th>
                    {showFilters && <th className="px-3 py-2.5 font-semibold">Waiting on</th>}
                    <th className="px-3 py-2.5 font-semibold">Progress</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Payable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((r) => (
                    <tr
                      key={r.requestId}
                      onClick={() => onOpen(r.requestId)}
                      className="cursor-pointer transition hover:bg-slate-50"
                    >
                      <td className="px-3 py-3">
                        <span className="font-mono text-xs font-semibold text-slate-700">{r.requestId}</span>
                        {r.isMine && <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">YOU</span>}
                        <span className="mt-0.5 block text-xs text-slate-400">{r.fromDate}</span>
                      </td>
                      {showEmployee && (
                        <td className="px-3 py-3">
                          <span className="font-medium text-slate-800">{r.employeeName}</span>
                          <span className="mt-0.5 block text-xs text-slate-400">
                            {r.employeeId} · Band {r.band} · {r.department}
                          </span>
                        </td>
                      )}
                      <td className="px-3 py-3 text-slate-600">
                        {r.scope === "inside" ? "Inside city" : "Outside city"}
                        <span className="mt-0.5 block text-xs text-slate-400">
                          {r.city}{r.destination ? ` · ${r.destination}` : ""}
                        </span>
                      </td>
                      <td className="px-3 py-3"><StatusBadge status={r.status} /></td>
                      {showFilters && (
                        <td className="px-3 py-3 text-slate-600">
                          {r.waitingOn || "—"}
                          {r.lastAction && (
                            <span className="mt-0.5 block text-xs text-slate-400">{r.lastAction}</span>
                          )}
                        </td>
                      )}
                      <td className="w-40 px-3 py-3"><ProgressBar status={r.status} /></td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-800">
                        <Money value={r.finalPayable} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
