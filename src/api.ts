/** Typed fetch wrapper. Holds the session token and unwraps API errors. */

import type {
  ApprovalRow, Computation, Policy, RequestDraft, RequestRecord, SessionUser,
} from "../shared/types.js";
import type { ModeOption } from "../shared/policy.js";

const TOKEN_KEY = "ta-perdiem-token";

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || "";
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...(init.headers || {}),
    },
  });
  if (res.status === 401) {
    clearToken();
    window.location.reload();
    throw new Error("Session expired.");
  }
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw Object.assign(new Error(body.error || `Request failed (${res.status})`), { body });
  return body as T;
}

const post = <T,>(path: string, data: unknown) =>
  call<T>(path, { method: "POST", body: JSON.stringify(data) });

export interface Summary {
  pending: number;
  approved: number;
  rejected: number;
  returned: number;
  paymentPending: number;
  paid: number;
  totalClaims: number;
  totalPaid: number;
  count: number;
}

/** Counters for the approver workspace — never mixed with personal claims. */
export interface DeskSummary {
  pending: number;
  pendingValue: number;
  processed: number;
  inFlight: number;
  awaitingPayment: number;
  advancesOpen: number;
  totalValue: number;
  count: number;
}

/** The advance step this user may take, decided by the server. */
export interface AdvanceStep {
  action: string;
  label: string;
}

/** A row in a list: the claim plus where it currently sits. */
export interface RequestListItem extends RequestRecord {
  isMine: boolean;
  /** Which desk it is waiting on right now, e.g. "Administration". */
  waitingOn: string;
  lastAction: string;
  lastActionAt: string;
}

export interface RequestDetail {
  request: RequestRecord;
  approval: ApprovalRow | null;
  canAct: boolean;
  canEdit: boolean;
  advanceStep: AdvanceStep | null;
}

export interface EmployeeLite {
  employeeId: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  band: string;
  gender: string;
}

export const api = {
  /** Which sign-in methods this deployment offers. */
  authMethods: () => call<{ password: boolean }>("/auth/methods"),
  /** Exchanges a verified 10 Minute School access token for an app session. */
  tenmsLogin: (accessToken: string) =>
    post<{ token: string; user: SessionUser }>("/auth/tenms", { accessToken }),
  login: (email: string, password: string) =>
    post<{ token: string; user: SessionUser }>("/login", { email, password }),
  me: () => call<{ user: SessionUser }>("/me"),
  policy: () => call<Policy>("/policy"),
  employees: (q: string) => call<{ employees: EmployeeLite[] }>(`/employees?q=${encodeURIComponent(q)}`),

  requests: (scope: string) =>
    call<{ requests: RequestListItem[]; summary: Summary; inbox: number; desk: DeskSummary }>(
      `/requests?scope=${scope}`,
    ),
  request: (id: string) => call<RequestDetail>(`/requests/${encodeURIComponent(id)}`),
  preview: (draft: RequestDraft) =>
    post<{ computation: Computation; modes: ModeOption[] }>("/requests/preview", { draft }),
  create: (draft: RequestDraft, submit: boolean) =>
    post<{ request: RequestRecord; computation: Computation }>("/requests", { draft, submit }),
  update: (id: string, draft: RequestDraft, submit: boolean) =>
    call<{ request: RequestRecord; computation: Computation }>(`/requests/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ draft, submit }),
    }),
  act: (id: string, action: string, remarks: string) =>
    post<{ request: RequestRecord }>(`/requests/${encodeURIComponent(id)}/action`, { action, remarks }),
  pay: (id: string, payload: Record<string, unknown>) =>
    post<{ request: RequestRecord }>(`/requests/${encodeURIComponent(id)}/payment`, payload),

  advances: (scope: "mine" | "desk") =>
    call<{ requests: (RequestRecord & { myStep: AdvanceStep | null })[] }>(`/advances?scope=${scope}`),
  advanceAction: (id: string, payload: Record<string, unknown>) =>
    post<{ request: RequestRecord }>(`/requests/${encodeURIComponent(id)}/advance`, payload),

  adminTabs: () =>
    call<{ tabs: string[]; headers: Record<string, string[]>; data: Record<string, Record<string, string>[]> }>(
      "/admin/tabs",
    ),
  saveTab: (tab: string, rows: Record<string, string>[]) =>
    post<{ ok: boolean }>(`/admin/tabs/${encodeURIComponent(tab)}`, { rows }),
};
