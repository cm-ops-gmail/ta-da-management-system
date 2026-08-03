import { useEffect, useState } from "react";
import {
  ArrowLeft, Banknote, Check, CircleDot, Clock, ExternalLink, FileText, HandCoins,
  Link as LinkIcon, Pencil, RotateCcw, X,
} from "lucide-react";
import { api, type RequestDetail as Detail } from "../api.js";
import type { ApprovalRow, Policy, RequestDraft, SessionUser } from "../../shared/types.js";
import { STATUS_PROGRESS, TRACK_STAGES } from "../../shared/types.js";
import { cfgNum, cfgStr } from "../../shared/policy.js";
import { Card, Empty, Field, Modal, Money, Notice, ProgressBar, Spinner, StatusBadge } from "./ui.js";

export default function RequestDetail({
  requestId, user, policy, onBack, onEdit, onChanged,
}: {
  requestId: string;
  user: SessionUser;
  policy: Policy;
  onBack: () => void;
  onEdit: (draft: RequestDraft, requestId: string) => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [action, setAction] = useState<"approve" | "reject" | "return" | "request_docs" | null>(null);
  const [paying, setPaying] = useState(false);
  const [advanceAction, setAdvanceAction] = useState<"approve" | "settle" | "reject" | null>(null);
  const currency = cfgStr(policy, "CURRENCY", "BDT");

  async function load() {
    setLoading(true);
    try {
      setDetail(await api.request(requestId));
      setError("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [requestId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Spinner />;
  if (error || !detail) return <Notice tone="error" items={[error || "Request not found."]} />;

  const r = detail.request;
  const a = detail.approval;
  const lines: [string, number][] = [
    ["Transportation (TA)", r.taAmount],
    [`Per-Diem${r.perDiemDays > 1 ? ` · ${r.perDiemDays} days` : ""}`, r.perDiemAmount],
    ["Lunch allowance", r.lunchAllowance],
    ["Accommodation", r.accommodationAmount],
    ["Rent-a-car", r.rentACarAmount],
    ["Flight", r.flightAmount],
    ["Other", r.otherAmount],
  ];

  // The server decides which advance step this person may take — the
  // Department Head is derived from the requester's line-manager chain, so it
  // is not something the client can work out from roles.
  const advanceStep = detail.advanceStep
    ? {
        mode: (detail.advanceStep.action === "settle" ? "settle" : "approve") as "settle" | "approve",
        label: detail.advanceStep.label,
        action: detail.advanceStep.action,
      }
    : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <button onClick={onBack} className="rounded-lg p-2 text-slate-500 hover:bg-slate-200">
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-base font-bold text-slate-900 sm:text-lg">{r.requestId}</h1>
              <StatusBadge status={r.status} />
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {r.employeeName} · Band {r.band} · {r.department} · submitted{" "}
              {r.submittedAt ? new Date(r.submittedAt).toLocaleString() : "—"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {detail.canEdit && (
            <button className="btn-ghost" onClick={() => onEdit(toDraft(r), r.requestId)}>
              <Pencil size={16} /> Edit & resubmit
            </button>
          )}
          {detail.canAct && r.status === "payment_processing" && (
            <button className="btn-success" onClick={() => setPaying(true)}>
              <Banknote size={16} /> Mark paid
            </button>
          )}
        </div>
      </div>

      <Card>
        <ProgressBar status={r.status} />
        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
          {TRACK_STAGES.map((stage) => {
            const status = a?.[`${stage.column.toLowerCase()}Status` as keyof ApprovalRow] as string | undefined;
            const by = a?.[`${stage.column.toLowerCase()}By` as keyof ApprovalRow] as string | undefined;
            const at = a?.[`${stage.column.toLowerCase()}At` as keyof ApprovalRow] as string | undefined;
            const done = ["Approved", "Paid"].includes(status || "");
            const current = r.status === stage.key;
            const blocked = ["Rejected", "Returned", "Documents Requested"].includes(status || "");
            return (
              <div
                key={stage.key}
                className={`rounded-xl border p-3 ${
                  blocked ? "border-rose-200 bg-rose-50"
                    : current ? "border-brand-300 bg-brand-50"
                      : done ? "border-emerald-200 bg-emerald-50"
                        : "border-slate-200 bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-2">
                  {blocked ? <X size={14} className="text-rose-600" />
                    : done ? <Check size={14} className="text-emerald-600" />
                      : current ? <Clock size={14} className="text-brand-600" />
                        : <CircleDot size={14} className="text-slate-300" />}
                  <p className={`text-xs font-bold ${
                    blocked ? "text-rose-700" : current ? "text-brand-700" : done ? "text-emerald-700" : "text-slate-400"
                  }`}>
                    {stage.label}
                  </p>
                </div>
                <p className="mt-1.5 text-xs font-semibold text-slate-600">{status || "Not started"}</p>
                {by && <p className="text-xs leading-snug text-slate-500">{by.replace(/<.*>/, "").trim()}</p>}
                {at && <p className="text-xs text-slate-400">{new Date(at).toLocaleString()}</p>}
              </div>
            );
          })}
        </div>
        {r.status === "rejected" && (
          <div className="mt-4"><Notice tone="error" items={[`Rejected — ${lastRemark(a) || "see remarks"}`]} /></div>
        )}
        {r.status === "returned" && (
          <div className="mt-4"><Notice tone="warn" items={[`Returned for correction — ${lastRemark(a) || "see remarks"}`]} /></div>
        )}
      </Card>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <Card title="Travel">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Row label="Type" value={r.scope === "inside" ? "Inside city" : "Outside city"} />
              <Row label="City" value={r.city} />
              <Row label="Destination" value={r.destination || "—"} />
              <Row label="Purpose" value={r.purpose} />
              <Row label="Dates" value={r.scope === "inside" ? r.fromDate : `${r.fromDate} → ${r.toDate} (${r.tripDays} days)`} />
              <Row label="Claim type" value={{ ta: "TA only", perdiem: "Per-Diem only", both: "TA + Per-Diem" }[r.claimType]} />
              {r.scope === "inside" && r.workingHours > 0 && (
                <Row label="Working hours" value={`${r.startTime}–${r.endTime} · ${r.workingHours} h`} />
              )}
              {r.workedAt && <Row label="Worked at" value={r.workedAt} />}
              {r.scope === "outside" && (
                <Row label="Arrangement" value={r.arrangement === "company" ? "Company arrangement" : "Self arrangement"} />
              )}
              {r.transportMode && <Row label="Transport" value={r.transportMode + (r.vehicleType ? ` · ${r.vehicleType}` : "")} />}
              {r.totalKM > 0 && <Row label="Distance" value={`${r.travelFrom} → ${r.travelTo} · ${r.totalKM} km × ${r.fuelRate}`} />}
              {r.dualWorkstation && <Row label="Dual workstation" value={r.dualWorkstationType} />}
              {r.hotelName && <Row label="Hotel" value={`${r.hotelName} · ${r.checkIn} → ${r.checkOut}`} />}
            </dl>
            {r.employeeNote && (
              <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <span className="font-semibold">Employee note: </span>{r.employeeNote}
              </p>
            )}
          </Card>

          {r.teamMembers.length > 0 && (
            <Card title={`Team (${r.teamMembers.length + 1} travellers)`}>
              <ul className="divide-y divide-slate-100 text-sm">
                {r.teamMembers.map((m) => (
                  <li key={m.employeeId} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>
                      <span className="font-medium text-slate-800">{m.name}</span>
                      <span className="ml-2 text-xs text-slate-400">{m.employeeId} · {m.designation}</span>
                    </span>
                    <span className="text-xs font-semibold text-slate-500">Band {m.band} · {m.department}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {r.legs.length > 0 && (
            <Card title="Trips claimed">
              <div className="-mx-1 overflow-x-auto px-1">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-2 pr-3 font-semibold">Date</th>
                      <th className="py-2 pr-3 font-semibold">Mode</th>
                      <th className="py-2 pr-3 font-semibold">From → To</th>
                      <th className="py-2 text-right font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {r.legs.map((l, i) => (
                      <tr key={i}>
                        <td className="py-2 pr-3 text-slate-600">{l.travelDate}</td>
                        <td className="py-2 pr-3 text-slate-600">{l.mode}</td>
                        <td className="py-2 pr-3 text-slate-600">{l.travelFrom} → {l.travelTo}</td>
                        <td className="py-2 text-right font-medium text-slate-800">
                          <Money value={l.amount} currency={currency} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Card
            title="Documents"
            subtitle={r.documentTypes.length ? r.documentTypes.join(" · ") : undefined}
          >
            {!r.documentLinks.length ? (
              <Empty title="No document links shared" />
            ) : (
              <ul className="space-y-2">
                {r.documentLinks.map((link, i) => (
                  <li key={i}>
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-sm transition hover:border-brand-200 hover:bg-slate-50"
                    >
                      <LinkIcon size={15} className="shrink-0 text-slate-400" />
                      <span className="min-w-0 flex-1 truncate font-medium text-slate-700">{link}</span>
                      <ExternalLink size={14} className="shrink-0 text-brand-500" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Approval trail" subtitle="One row per request — each desk keeps its own decision, remark and timestamp.">
            {!a ? (
              <Empty title="Nothing logged yet" />
            ) : (
              <div className="-mx-1 overflow-x-auto px-1">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-2 pr-3 font-semibold">Stage</th>
                      <th className="py-2 pr-3 font-semibold">Status</th>
                      <th className="py-2 pr-3 font-semibold">By</th>
                      <th className="py-2 pr-3 font-semibold">When</th>
                      <th className="py-2 font-semibold">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="py-2 pr-3 font-medium text-slate-700">Submitted</td>
                      <td className="py-2 pr-3 text-slate-600">Submitted</td>
                      <td className="py-2 pr-3 text-slate-600">{r.employeeName}</td>
                      <td className="py-2 pr-3 text-slate-500">{a.submittedAt ? new Date(a.submittedAt).toLocaleString() : "—"}</td>
                      <td className="py-2 text-slate-600">{a.submittedRemarks || "—"}</td>
                    </tr>
                    {TRACK_STAGES.map((s) => {
                      const k = s.column.toLowerCase();
                      const status = a[`${k}Status` as keyof ApprovalRow] as string;
                      return (
                        <tr key={s.key}>
                          <td className="py-2 pr-3 font-medium text-slate-700">{s.label}</td>
                          <td className="py-2 pr-3 text-slate-600">{status || "—"}</td>
                          <td className="py-2 pr-3 text-slate-600">
                            {String(a[`${k}By` as keyof ApprovalRow] || "—").replace(/<.*>/, "").trim() || "—"}
                          </td>
                          <td className="py-2 pr-3 text-slate-500">
                            {a[`${k}At` as keyof ApprovalRow]
                              ? new Date(String(a[`${k}At` as keyof ApprovalRow])).toLocaleString()
                              : "—"}
                          </td>
                          <td className="py-2 text-slate-600">{String(a[`${k}Remarks` as keyof ApprovalRow] || "—")}</td>
                        </tr>
                      );
                    })}
                    {r.advanceRequested > 0 && (
                      <>
                        <tr>
                          <td className="py-2 pr-3 font-medium text-slate-700">Advance · HR</td>
                          <td className="py-2 pr-3 text-slate-600">{a.advanceHRStatus || "—"}</td>
                          <td className="py-2 pr-3 text-slate-600">{a.advanceHRBy?.replace(/<.*>/, "").trim() || "—"}</td>
                          <td className="py-2 pr-3 text-slate-500">{a.advanceHRAt ? new Date(a.advanceHRAt).toLocaleString() : "—"}</td>
                          <td className="py-2 text-slate-600">—</td>
                        </tr>
                        <tr>
                          <td className="py-2 pr-3 font-medium text-slate-700">Advance · Dept Head</td>
                          <td className="py-2 pr-3 text-slate-600">{a.advanceDeptHeadStatus || "—"}</td>
                          <td className="py-2 pr-3 text-slate-600">{a.advanceDeptHeadBy?.replace(/<.*>/, "").trim() || "—"}</td>
                          <td className="py-2 pr-3 text-slate-500">{a.advanceDeptHeadAt ? new Date(a.advanceDeptHeadAt).toLocaleString() : "—"}</td>
                          <td className="py-2 text-slate-600">—</td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="card overflow-hidden">
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Claim summary</p>
            </div>
            <div className="space-y-2 px-5 py-4 text-sm">
              {lines.filter(([, v]) => v > 0).map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-slate-600">{label}</span>
                  <span className="font-medium text-slate-800"><Money value={value} currency={currency} /></span>
                </div>
              ))}
              <div className="flex justify-between border-t border-slate-200 pt-3">
                <span className="font-semibold text-slate-700">Total claim</span>
                <span className="font-bold text-slate-900"><Money value={r.totalClaim} currency={currency} /></span>
              </div>
              {r.advanceRequested > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-600">Advance adjustment</span>
                  <span className="font-medium text-rose-600">− <Money value={r.advanceRequested} currency={currency} /></span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-2">
                <span className="font-semibold text-slate-700">Final payable</span>
                <span className="font-bold text-emerald-600"><Money value={r.finalPayable} currency={currency} /></span>
              </div>
            </div>
          </div>

          {r.advanceRequested > 0 && (
            <Card title="Advance">
              <dl className="space-y-2 text-sm">
                <Row label="Requested" value={`${currency} ${r.advanceRequested}`} />
                <Row label="Approved" value={r.advanceApproved ? `${currency} ${r.advanceApproved}` : "—"} />
                <Row label="Status" value={r.advanceStatus.replace(/_/g, " ") || "pending"} />
                <Row label="Settlement due" value={r.settlementDueDate || "—"} />
                {r.settledAt && <Row label="Settled" value={`${currency} ${r.settledAmount} on ${new Date(r.settledAt).toLocaleDateString()}`} />}
              </dl>
              {advanceStep && (
                <div className="mt-4 grid gap-2">
                  <button className="btn-success" onClick={() => setAdvanceAction(advanceStep.mode)}>
                    {advanceStep.mode === "settle" ? <HandCoins size={16} /> : <Check size={16} />} {advanceStep.label}
                  </button>
                  {advanceStep.mode === "approve" && (
                    <button className="btn-danger" onClick={() => setAdvanceAction("reject")}>
                      <X size={16} /> Reject advance
                    </button>
                  )}
                </div>
              )}
            </Card>
          )}

          {r.paidAmount > 0 && (
            <Card title="Payment">
              <dl className="space-y-2 text-sm">
                <Row label="Amount" value={`${currency} ${r.paidAmount}`} />
                <Row label="Mode" value={r.paymentMode} />
                <Row label="Transaction" value={r.transactionId} />
                <Row label="Date" value={r.paymentDate} />
                <Row label="Processed by" value={r.paidBy.replace(/<.*>/, "").trim()} />
              </dl>
            </Card>
          )}

          {r.policyNotes && (
            <Notice tone="info" title="Policy applied" items={r.policyNotes.split(" | ").filter(Boolean)} />
          )}

          {detail.canAct && (
            <Card
              title="Your decision"
              subtitle={
                r.status === "payment_processing"
                  ? "Already approved — record the payment, or send it back if something is wrong."
                  : `This request is at your desk as ${r.status.replace(/_/g, " ")}.`
              }
            >
              <div className="grid gap-2">
                {r.status === "payment_processing" ? (
                  <button className="btn-success" onClick={() => setPaying(true)}>
                    <Banknote size={16} /> Mark paid
                  </button>
                ) : (
                  <button className="btn-success" onClick={() => setAction("approve")}>
                    <Check size={16} /> Approve
                  </button>
                )}
                <button className="btn-ghost" onClick={() => setAction("return")}>
                  <RotateCcw size={16} /> Return for correction
                </button>
                <button className="btn-ghost" onClick={() => setAction("request_docs")}>
                  <FileText size={16} /> Request more documents
                </button>
                <button className="btn-danger" onClick={() => setAction("reject")}>
                  <X size={16} /> Reject
                </button>
              </div>
            </Card>
          )}
        </aside>
      </div>

      {action && (
        <ActionModal
          action={action}
          requestId={r.requestId}
          onClose={() => setAction(null)}
          onDone={() => { setAction(null); load(); onChanged(); }}
        />
      )}

      {paying && (
        <PaymentModal
          requestId={r.requestId}
          amount={r.finalPayable}
          methods={policy.paymentMethods}
          currency={currency}
          onClose={() => setPaying(false)}
          onDone={() => { setPaying(false); load(); onChanged(); }}
        />
      )}

      {advanceAction && (
        <AdvanceModal
          requestId={r.requestId}
          mode={advanceAction}
          action={advanceStep?.action || "hr_approve"}
          currency={currency}
          requested={r.advanceRequested}
          approved={r.advanceApproved}
          limit={cfgNum(policy, "ADVANCE_AUTO_LIMIT", 10000)}
          onClose={() => setAdvanceAction(null)}
          onDone={() => { setAdvanceAction(null); load(); onChanged(); }}
        />
      )}
    </div>
  );
}

function lastRemark(a: ApprovalRow | null): string {
  if (!a) return "";
  return a.paymentRemarks || a.financeRemarks || a.adminRemarks || a.managerRemarks || "";
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-700">{value}</dd>
    </div>
  );
}

const ACTION_TITLE = {
  approve: "Approve request",
  reject: "Reject request",
  return: "Return for correction",
  request_docs: "Request more documents",
};

function ActionModal({
  action, requestId, onClose, onDone,
}: {
  action: keyof typeof ACTION_TITLE;
  requestId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function go() {
    setBusy(true);
    setError("");
    try {
      await api.act(requestId, action, remarks);
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title={ACTION_TITLE[action]} onClose={onClose}>
      <div className="space-y-4">
        <Field
          label="Remarks"
          required={action !== "approve"}
          hint={action === "approve" ? "Optional — visible to the employee." : "Explain what the employee needs to do."}
        >
          <textarea className="field min-h-24" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </Field>
        {error && <Notice tone="error" items={[error]} />}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className={action === "reject" ? "btn-danger" : "btn-primary"} onClick={go} disabled={busy}>
            Confirm
          </button>
        </div>
      </div>
    </Modal>
  );
}

function PaymentModal({
  requestId, amount, methods, currency, onClose, onDone,
}: {
  requestId: string;
  amount: number;
  methods: string[];
  currency: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [paymentMode, setPaymentMode] = useState(methods[0] || "Bank");
  const [transactionId, setTransactionId] = useState("");
  const [paid, setPaid] = useState(amount);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function go() {
    setBusy(true);
    setError("");
    try {
      await api.pay(requestId, { paymentMode, transactionId, amount: paid, paymentDate, note });
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Record payment" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Payment mode" required>
            <select className="field" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
              {methods.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </Field>
          <Field label={`Amount (${currency})`} required>
            <input type="number" className="field" value={paid} onChange={(e) => setPaid(Number(e.target.value))} />
          </Field>
          <Field label="Transaction ID" required>
            <input className="field" value={transactionId} onChange={(e) => setTransactionId(e.target.value)} />
          </Field>
          <Field label="Payment date" required>
            <input type="date" className="field" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Note">
          <input className="field" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <Notice tone="error" items={[error]} />}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-success" onClick={go} disabled={busy}>
            <Banknote size={16} /> Mark paid
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function AdvanceModal({
  requestId, mode, action, currency, requested, approved, limit, onClose, onDone,
}: {
  requestId: string;
  mode: "approve" | "settle" | "reject";
  /** The exact API action the server said this person may take. */
  action: string;
  currency: string;
  requested: number;
  approved: number;
  limit: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(approved || requested);
  const [settled, setSettled] = useState(approved || requested);
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function go() {
    setBusy(true);
    setError("");
    try {
      await api.advanceAction(requestId, {
        action: mode === "reject" ? "reject" : action,
        amount,
        settledAmount: settled,
        remarks,
      });
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const title = mode === "settle" ? "Record advance settlement" : mode === "reject" ? "Reject advance" : "Approve advance";
  return (
    <Modal title={`${title} — ${requestId}`} onClose={onClose}>
      <div className="space-y-4">
        {mode === "approve" && (
          <>
            <Field label={`Approved amount (${currency})`} required>
              <input type="number" className="field" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            </Field>
            {requested > limit && action !== "dept_head_approve" && (
              <Notice tone="warn" items={[`Above ${currency} ${limit}, this still needs Department Head approval after yours.`]} />
            )}
          </>
        )}
        {mode === "settle" && (
          <Field label={`Settled amount (${currency})`} required hint="What the employee actually returned or adjusted.">
            <input type="number" className="field" value={settled} onChange={(e) => setSettled(Number(e.target.value))} />
          </Field>
        )}
        <Field label="Remarks" required={mode === "reject"}>
          <textarea className="field min-h-20" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </Field>
        {error && <Notice tone="error" items={[error]} />}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className={mode === "reject" ? "btn-danger" : "btn-success"} onClick={go} disabled={busy}>
            Confirm
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Rebuilds an editable draft from a stored request, for "Edit & resubmit". */
function toDraft(r: Detail["request"]): RequestDraft {
  return {
    requestId: r.requestId,
    scope: r.scope,
    city: r.city,
    claimType: r.claimType,
    travelType: r.travelType,
    teamMembers: r.teamMembers,
    fromDate: r.fromDate,
    toDate: r.toDate,
    purpose: r.purpose,
    destination: r.destination,
    startTime: r.startTime,
    endTime: r.endTime,
    workedAt: r.workedAt,
    arrangement: r.arrangement,
    transportMode: r.transportMode,
    vehicleType: r.vehicleType,
    carSpecialApproval: r.carSpecialApproval,
    travelFrom: r.travelFrom,
    travelTo: r.travelTo,
    totalKM: r.totalKM,
    legs: r.legs,
    workedDuringLunch: r.workedDuringLunch,
    officeMealTaken: r.officeMealTaken,
    dualWorkstation: r.dualWorkstation,
    dualWorkstationType: r.dualWorkstationType,
    hotelName: r.hotelName,
    checkIn: r.checkIn,
    checkOut: r.checkOut,
    accommodationAmount: r.accommodationAmount,
    rentACarAmount: r.rentACarAmount,
    rentACarHeadcount: r.rentACarHeadcount,
    flightAmount: r.flightAmount,
    otherAmount: r.otherAmount,
    otherNote: r.otherNote,
    advanceRequested: r.advanceRequested,
    documentTypes: r.documentTypes,
    documentLinks: r.documentLinks,
    employeeNote: r.employeeNote,
  };
}
