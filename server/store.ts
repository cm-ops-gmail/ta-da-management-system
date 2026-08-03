/**
 * Domain layer: converts between sheet rows and typed records, loads the
 * admin-configured policy, and owns ID generation.
 *
 * A request occupies exactly one row. The repeating parts — trips, team
 * members, document links — are packed into a single cell each, one item per
 * line with ` | ` between fields, so the sheet stays readable and a request is
 * never spread across rows.
 */

import crypto from "crypto";
import { appendRow, readTab, readTabs, updateRow, withSheetLock, type Row } from "./sheets.js";
import type {
  ApprovalRow, Leg, Policy, RequestRecord, Role, SessionUser, StageKey, Status, TeamMember,
} from "../shared/types.js";

const num = (v: string | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const bool = (v: string | undefined): boolean =>
  ["yes", "true", "1"].includes(String(v || "").trim().toLowerCase());
const yn = (v: boolean): string => (v ? "Yes" : "No");
const csv = (v: string | undefined): string[] =>
  String(v || "").split(",").map((s) => s.trim()).filter(Boolean);
const lines = (v: string | undefined): string[] =>
  String(v || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

export function nowISO(): string {
  return new Date().toISOString();
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
}

/** Splits document links pasted on one line, on several lines, or comma-separated. */
export function parseLinks(input: string | string[] | undefined): string[] {
  const raw = Array.isArray(input) ? input.join("\n") : String(input || "");
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ── Policy ──────────────────────────────────────────────────────────────────

let policyCache: { policy: Policy; at: number } | null = null;
const POLICY_TTL_MS = 30_000;

export function invalidatePolicy(): void {
  policyCache = null;
}

export async function loadPolicy(): Promise<Policy> {
  if (policyCache && Date.now() - policyCache.at < POLICY_TTL_MS) return policyCache.policy;

  const tabs = await readTabs(["Config", "BandPolicy", "Lists"]);
  const active = tabs.Lists.filter((r) => bool(r.Active));
  const of = (name: string) => active.filter((r) => r.ListName === name);

  const policy: Policy = {
    config: Object.fromEntries(tabs.Config.map((r) => [r.Key, r.Value])),
    bands: tabs.BandPolicy.map((r) => ({
      band: r.Band,
      modesMale: csv(r.ModesMale),
      modesFemale: csv(r.ModesFemale),
      outsideTAWeekday: num(r.OutsideTAWeekday),
      outsideTAWeekend: num(r.OutsideTAWeekend),
      accommodationLimit: num(r.AccommodationLimit),
      flightEligible: bool(r.FlightEligible),
      carPoolEligible: bool(r.CarPoolEligible),
    })),
    cities: of("City").map((r) => ({
      city: r.Value,
      zone: (r.Extra1 === "Outside" ? "Outside" : "Inside") as "Inside" | "Outside",
    })),
    modes: of("TransportMode").map((r) => ({
      mode: r.Value,
      label: r.Label || r.Value,
      scope: (["Inside", "Outside", "Both"].includes(r.Extra1) ? r.Extra1 : "Both") as "Inside" | "Outside" | "Both",
      requiresReceipt: bool(r.Extra2),
    })),
    workedAtOptions: of("WorkedAt").map((r) => r.Value),
    dualWorkstationOptions: of("DualWorkstation").map((r) => r.Value),
    paymentMethods: of("PaymentMethod").map((r) => r.Value),
    documentTypes: of("DocumentType").map((r) => r.Value),
    approvalFlow: of("ApprovalStage")
      .map((r) => ({ step: num(r.Extra1), stage: r.Value, label: r.Label || r.Value, roleRequired: r.Extra2 }))
      .sort((a, b) => a.step - b.step),
  };

  policyCache = { policy, at: Date.now() };
  return policy;
}

// ── Employees ───────────────────────────────────────────────────────────────

export interface EmployeeRow extends SessionUser {
  password: string;
  status: string;
  _row: string;
}

export function toEmployee(r: Row & { _row: string }): EmployeeRow {
  return {
    employeeId: r.EmployeeID,
    name: r.Name,
    email: String(r.Email || "").trim(),
    password: String(r.Password ?? ""),
    gender: r.Gender,
    band: r.Band,
    department: r.Department,
    designation: r.Designation,
    lineManagerId: r.LineManagerID,
    roles: (csv(r.Roles).length ? csv(r.Roles) : ["employee"]) as Role[],
    paymentMethod: r.PaymentMethod,
    accountNumber: r.AccountNumber,
    status: r.Status || "Active",
    _row: r._row,
  };
}

/**
 * The roster is read on login, on every team-member search and on every
 * approval (to find the next desk's recipients). It changes rarely, so a short
 * cache removes most of those reads. Admin edits invalidate it immediately; a
 * row added straight into the sheet is picked up within the TTL.
 */
let employeeCache: { rows: EmployeeRow[]; at: number } | null = null;
const EMPLOYEE_TTL_MS = 45_000;

export function invalidateEmployees(): void {
  employeeCache = null;
}

export async function allEmployees(): Promise<EmployeeRow[]> {
  if (employeeCache && Date.now() - employeeCache.at < EMPLOYEE_TTL_MS) return employeeCache.rows;
  const rows = (await readTab("Employees")).map(toEmployee);
  employeeCache = { rows, at: Date.now() };
  return rows;
}

// ── Hierarchy, derived from the LineManagerID column ────────────────────────

/**
 * True when anyone active reports to this person. That is the whole definition
 * of "line manager" in this system — nothing is written in the Roles column,
 * so moving a report to a different manager immediately moves the approval.
 */
export async function managesOthers(employeeId: string): Promise<boolean> {
  if (!employeeId) return false;
  return (await allEmployees()).some(
    (e) => e.status === "Active" && e.lineManagerId === employeeId && e.employeeId !== employeeId,
  );
}

/**
 * The department head for a given employee: one level above the line manager
 * who approves their claims. If the line manager is already the top of the
 * chain there is no separate head, and the advance stops at HR.
 *
 * Walks at most a few links so a bad LineManagerID loop can never hang.
 */
export async function deptHeadIdFor(employeeId: string): Promise<string> {
  const byId = new Map((await allEmployees()).map((e) => [e.employeeId, e]));
  const employee = byId.get(employeeId);
  const lineManager = employee?.lineManagerId ? byId.get(employee.lineManagerId) : undefined;
  if (!lineManager || lineManager.employeeId === employeeId) return "";
  const head = lineManager.lineManagerId ? byId.get(lineManager.lineManagerId) : undefined;
  if (!head || head.employeeId === lineManager.employeeId) return "";
  return head.employeeId;
}

// ── Packing repeating data into a single cell ───────────────────────────────

function packTeam(members: TeamMember[]): string {
  return members
    .map((m) => [m.employeeId, m.name, m.department, m.designation, m.band].join(" | "))
    .join("\n");
}

function unpackTeam(cell: string | undefined): TeamMember[] {
  return lines(cell).map((line) => {
    const [employeeId = "", name = "", department = "", designation = "", band = ""] =
      line.split("|").map((s) => s.trim());
    return { employeeId, name, department, designation, band };
  });
}

function packTrips(legs: Leg[]): string {
  return legs
    .map((l) => [l.travelDate, l.mode, l.travelFrom, l.travelTo, l.amount, l.note].join(" | "))
    .join("\n");
}

function unpackTrips(cell: string | undefined): Leg[] {
  return lines(cell).map((line) => {
    const [travelDate = "", mode = "", travelFrom = "", travelTo = "", amount = "", note = ""] =
      line.split("|").map((s) => s.trim());
    return { travelDate, mode, travelFrom, travelTo, amount: num(amount), note };
  });
}

// ── Requests ────────────────────────────────────────────────────────────────

export function toRequest(r: Row & { _row: string }): RequestRecord & { _row: string } {
  return {
    _row: r._row,
    requestId: r.RequestID,
    createdAt: r.CreatedAt,
    updatedAt: r.UpdatedAt,
    status: (r.Status || "draft") as Status,
    employeeId: r.EmployeeID,
    employeeName: r.EmployeeName,
    email: r.Email,
    band: r.Band,
    department: r.Department,
    designation: r.Designation,
    scope: r.Scope === "outside" ? "outside" : "inside",
    city: r.City,
    claimType: (["ta", "perdiem", "both"].includes(r.ClaimType) ? r.ClaimType : "both") as RequestRecord["claimType"],
    travelType: r.TravelType === "team" ? "team" : "individual",
    teamSize: num(r.TeamSize),
    teamMembers: unpackTeam(r.TeamMembers),
    fromDate: r.FromDate,
    toDate: r.ToDate,
    tripDays: num(r.TripDays),
    purpose: r.Purpose,
    destination: r.Destination,
    startTime: r.StartTime,
    endTime: r.EndTime,
    workingHours: num(r.WorkingHours),
    workedAt: r.WorkedAt,
    arrangement: r.Arrangement === "company" ? "company" : "self",
    transportMode: r.TransportMode,
    vehicleType: r.VehicleType,
    carSpecialApproval: bool(r.CarSpecialApproval),
    travelFrom: r.TravelFrom,
    travelTo: r.TravelTo,
    totalKM: num(r.TotalKM),
    fuelRate: num(r.FuelRate),
    legs: unpackTrips(r.Trips),
    taAmount: num(r.TAAmount),
    perDiemDays: num(r.PerDiemDays),
    perDiemAmount: num(r.PerDiemAmount),
    lunchAllowance: num(r.LunchAllowance),
    workedDuringLunch: bool(r.WorkedDuringLunch),
    officeMealTaken: bool(r.OfficeMealTaken),
    dualWorkstation: bool(r.DualWorkstation),
    dualWorkstationType: r.DualWorkstationType,
    hotelName: r.HotelName,
    checkIn: r.CheckIn,
    checkOut: r.CheckOut,
    accommodationAmount: num(r.AccommodationAmount),
    rentACarAmount: num(r.RentACarAmount),
    rentACarHeadcount: num(r.RentACarHeadcount),
    flightAmount: num(r.FlightAmount),
    otherAmount: num(r.OtherAmount),
    otherNote: r.OtherNote,
    totalClaim: num(r.TotalClaim),
    advanceRequested: num(r.AdvanceRequested),
    advanceApproved: num(r.AdvanceApproved),
    advanceStatus: r.AdvanceStatus,
    settlementDueDate: r.SettlementDueDate,
    settledAmount: num(r.SettledAmount),
    settledAt: r.SettledAt,
    finalPayable: num(r.FinalPayable),
    managerId: r.ManagerID,
    managerEmail: r.ManagerEmail,
    submittedAt: r.SubmittedAt,
    completedAt: r.CompletedAt,
    documentTypes: csv(r.DocumentTypes),
    documentLinks: lines(r.DocumentLinks),
    policyNotes: r.PolicyNotes,
    employeeNote: r.EmployeeNote,
    paymentMode: r.PaymentMode,
    transactionId: r.TransactionID,
    paymentDate: r.PaymentDate,
    paidAmount: num(r.PaidAmount),
    paidBy: r.PaidBy,
  };
}

export function fromRequest(req: RequestRecord): Row {
  return {
    RequestID: req.requestId,
    CreatedAt: req.createdAt,
    UpdatedAt: req.updatedAt,
    Status: req.status,
    EmployeeID: req.employeeId,
    EmployeeName: req.employeeName,
    Email: req.email,
    Band: req.band,
    Department: req.department,
    Designation: req.designation,
    Scope: req.scope,
    City: req.city,
    ClaimType: req.claimType,
    TravelType: req.travelType,
    TeamSize: String(req.teamSize),
    TeamMembers: packTeam(req.teamMembers),
    FromDate: req.fromDate,
    ToDate: req.toDate,
    TripDays: String(req.tripDays),
    Purpose: req.purpose,
    Destination: req.destination,
    StartTime: req.startTime,
    EndTime: req.endTime,
    WorkingHours: String(req.workingHours),
    WorkedAt: req.workedAt,
    Arrangement: req.arrangement,
    TransportMode: req.transportMode,
    VehicleType: req.vehicleType,
    CarSpecialApproval: yn(req.carSpecialApproval),
    TravelFrom: req.travelFrom,
    TravelTo: req.travelTo,
    TotalKM: String(req.totalKM),
    FuelRate: String(req.fuelRate),
    Trips: packTrips(req.legs),
    TAAmount: String(req.taAmount),
    PerDiemDays: String(req.perDiemDays),
    PerDiemAmount: String(req.perDiemAmount),
    LunchAllowance: String(req.lunchAllowance),
    WorkedDuringLunch: yn(req.workedDuringLunch),
    OfficeMealTaken: yn(req.officeMealTaken),
    DualWorkstation: yn(req.dualWorkstation),
    DualWorkstationType: req.dualWorkstationType,
    HotelName: req.hotelName,
    CheckIn: req.checkIn,
    CheckOut: req.checkOut,
    AccommodationAmount: String(req.accommodationAmount),
    RentACarAmount: String(req.rentACarAmount),
    RentACarHeadcount: String(req.rentACarHeadcount),
    FlightAmount: String(req.flightAmount),
    OtherAmount: String(req.otherAmount),
    OtherNote: req.otherNote,
    TotalClaim: String(req.totalClaim),
    AdvanceRequested: String(req.advanceRequested),
    AdvanceApproved: String(req.advanceApproved),
    AdvanceStatus: req.advanceStatus,
    SettlementDueDate: req.settlementDueDate,
    SettledAmount: req.settledAmount ? String(req.settledAmount) : "",
    SettledAt: req.settledAt,
    FinalPayable: String(req.finalPayable),
    ManagerID: req.managerId,
    ManagerEmail: req.managerEmail,
    SubmittedAt: req.submittedAt,
    CompletedAt: req.completedAt,
    DocumentTypes: req.documentTypes.join(", "),
    DocumentLinks: req.documentLinks.join("\n"),
    PaymentMode: req.paymentMode,
    TransactionID: req.transactionId,
    PaymentDate: req.paymentDate,
    PaidAmount: req.paidAmount ? String(req.paidAmount) : "",
    PaidBy: req.paidBy,
    PolicyNotes: req.policyNotes,
    EmployeeNote: req.employeeNote,
  };
}

/** Human-readable, sortable request number: TA-2026-000147. */
export async function nextRequestId(prefix: string): Promise<string> {
  const rows = await readTab("Requests");
  const year = new Date().getFullYear();
  const used = rows
    .map((r) => r.RequestID)
    .filter((rid) => rid?.startsWith(`${prefix}-${year}-`))
    .map((rid) => Number(rid.split("-")[2]) || 0);
  return `${prefix}-${year}-${String((used.length ? Math.max(...used) : 0) + 1).padStart(6, "0")}`;
}

// ── Approvals: one row per request, one column group per desk ───────────────

export function toApprovalRow(r: Row & { _row: string }): ApprovalRow & { _row: string } {
  return {
    _row: r._row,
    requestId: r.RequestID,
    employeeName: r.EmployeeName,
    currentStage: r.CurrentStage,
    submittedAt: r.SubmittedAt,
    submittedRemarks: r.SubmittedRemarks,
    managerStatus: r.ManagerStatus,
    managerBy: r.ManagerBy,
    managerAt: r.ManagerAt,
    managerRemarks: r.ManagerRemarks,
    adminStatus: r.AdminStatus,
    adminBy: r.AdminBy,
    adminAt: r.AdminAt,
    adminRemarks: r.AdminRemarks,
    financeStatus: r.FinanceStatus,
    financeBy: r.FinanceBy,
    financeAt: r.FinanceAt,
    financeRemarks: r.FinanceRemarks,
    paymentStatus: r.PaymentStatus,
    paymentBy: r.PaymentBy,
    paymentAt: r.PaymentAt,
    paymentRemarks: r.PaymentRemarks,
    advanceHRStatus: r.AdvanceHRStatus,
    advanceHRBy: r.AdvanceHRBy,
    advanceHRAt: r.AdvanceHRAt,
    advanceDeptHeadStatus: r.AdvanceDeptHeadStatus,
    advanceDeptHeadBy: r.AdvanceDeptHeadBy,
    advanceDeptHeadAt: r.AdvanceDeptHeadAt,
    lastAction: r.LastAction,
    lastActionAt: r.LastActionAt,
  };
}

/** Which Approvals column group a workflow stage writes into. */
export const STAGE_COLUMN: Record<string, StageKey> = {
  manager_review: "Manager",
  admin_review: "Admin",
  finance_review: "Finance",
  payment_processing: "Payment",
};

export interface StagePatch {
  /** Column group to write, e.g. "Manager". */
  group: StageKey | "AdvanceHR" | "AdvanceDeptHead";
  status?: string;
  by?: string;
  remarks?: string;
}

export interface ApprovalMeta {
  currentStage?: string;
  lastAction?: string;
}

/**
 * Creates the request's Approvals row if it does not exist yet, then applies
 * every column-group patch in one write. Approving normally touches two groups
 * — this desk's result and the next desk's "Pending" — and doing both in a
 * single call halves the write cost of an approval.
 *
 * Re-deciding a stage overwrites that group, which is the point: one request,
 * one row.
 */
export async function upsertApproval(
  requestId: string,
  employeeName: string,
  patches: StagePatch[],
  meta: ApprovalMeta = {},
): Promise<void> {
  // Read-then-create, so it has to be serialised: two approvals landing at the
  // same instant would otherwise both see "no row yet" and append two.
  await withSheetLock(async () => {
  const rows = await readTab("Approvals");
  const existing = rows.find((r) => r.RequestID === requestId);
  const stamp = nowISO();

  const base: Row = existing
    ? { ...existing }
    : { RequestID: requestId, EmployeeName: employeeName, SubmittedAt: stamp };

  if (meta.currentStage !== undefined) base.CurrentStage = meta.currentStage;
  if (meta.lastAction) {
    base.LastAction = meta.lastAction;
    base.LastActionAt = stamp;
  }

  for (const patch of patches) {
    if (patch.status !== undefined) base[`${patch.group}Status`] = patch.status;
    if (patch.by !== undefined) base[`${patch.group}By`] = patch.by;
    base[`${patch.group}At`] = stamp;
    if (patch.remarks !== undefined && patch.group !== "AdvanceHR" && patch.group !== "AdvanceDeptHead") {
      base[`${patch.group}Remarks`] = patch.remarks;
    }
  }

    delete base._row;
    if (existing) await updateRow("Approvals", existing._row, base);
    else await appendRow("Approvals", base);
  });
}

