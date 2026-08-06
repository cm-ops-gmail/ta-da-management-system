/**
 * The policy engine.
 *
 * Pure functions only — no I/O — so the Express API and the React client run
 * exactly the same rules. The client uses it to hide ineligible options and
 * preview amounts live; the server re-runs it on submit and is authoritative.
 *
 * Nothing here hard-codes a rate, a limit or a band's transport list: every
 * number comes out of the `Policy` object, which is loaded from the
 * admin-editable Config / BandPolicy tabs.
 */

import type {
  BandPolicy, ClaimType, Computation, Policy, RequestDraft, Scope, SessionUser,
} from "./types.js";

// ── small helpers ───────────────────────────────────────────────────────────

export function cfgNum(policy: Policy, key: string, fallback: number): number {
  const raw = policy.config[key];
  const n = Number(raw);
  return raw !== undefined && raw !== "" && Number.isFinite(n) ? n : fallback;
}

export function cfgStr(policy: Policy, key: string, fallback = ""): string {
  const raw = policy.config[key];
  return raw === undefined || raw === "" ? fallback : raw;
}

export function money(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function bandPolicy(policy: Policy, band: string): BandPolicy | undefined {
  return policy.bands.find((b) => b.band.toUpperCase() === String(band || "").toUpperCase());
}

/** Bangladesh weekend: Friday and Saturday. */
export function isWeekend(date: string | Date): boolean {
  const d = typeof date === "string" ? new Date(`${date}T00:00:00`) : date;
  if (Number.isNaN(d.getTime())) return false;
  const day = d.getDay();
  return day === 5 || day === 6;
}

/** Inclusive day span between two ISO dates, split into weekday / weekend. */
export function daySpan(fromDate: string, toDate: string): { total: number; weekday: number; weekend: number } {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate || fromDate}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
    return { total: 0, weekday: 0, weekend: 0 };
  }
  let weekday = 0;
  let weekend = 0;
  const cur = new Date(from);
  while (cur <= to) {
    if (isWeekend(cur)) weekend += 1;
    else weekday += 1;
    cur.setDate(cur.getDate() + 1);
  }
  return { total: weekday + weekend, weekday, weekend };
}

/** Business days (Sun–Thu) strictly between today and a future date. */
export function businessDaysUntil(target: string, from: Date = new Date()): number {
  const end = new Date(`${target}T00:00:00`);
  if (Number.isNaN(end.getTime())) return 0;
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  if (end <= start) return 0;
  let count = 0;
  const cur = new Date(start);
  cur.setDate(cur.getDate() + 1);
  while (cur <= end) {
    if (!isWeekend(cur)) count += 1;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/** Adds N business days to a date, returning an ISO date string. */
export function addBusinessDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (!isWeekend(d)) left -= 1;
  }
  return d.toISOString().slice(0, 10);
}

/** Decimal hours between two HH:MM times; an end before the start wraps midnight. */
export function workingHours(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((v) => !Number.isFinite(v))) return 0;
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return Math.round((mins / 60) * 100) / 100;
}

/** True when the shift overlaps the configured office lunch window. */
export function coversLunchWindow(policy: Policy, start: string, end: string): boolean {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
  };
  const s = toMin(start);
  const e = toMin(end);
  const ls = toMin(cfgStr(policy, "LUNCH_WINDOW_START", "13:00"));
  const le = toMin(cfgStr(policy, "LUNCH_WINDOW_END", "15:00"));
  if ([s, e, ls, le].some((v) => Number.isNaN(v))) return false;
  return s < le && e > ls;
}

export function fuelRateFor(policy: Policy, vehicleType: string): number {
  return vehicleType === "Car"
    ? cfgNum(policy, "FUEL_RATE_CAR", 10)
    : cfgNum(policy, "FUEL_RATE_BIKE", 3);
}

export function cityZone(policy: Policy, city: string): "Inside" | "Outside" | "" {
  return policy.cities.find((c) => c.city === city)?.zone ?? "";
}

// ── transport eligibility ───────────────────────────────────────────────────

export interface EligibilityContext {
  band: string;
  gender: string;
  scope: Scope;
  travelType: "individual" | "team";
  /** Total travellers including the requester. */
  teamSize: number;
  carSpecialApproval: boolean;
}

export interface ModeOption {
  mode: string;
  label: string;
  enabled: boolean;
  /** Why a visible-but-locked option is locked. Empty when enabled. */
  reason: string;
  requiresReceipt: boolean;
}

/**
 * The set of transport options a given employee may pick, already filtered by
 * band, gender and team size. Options the policy forbids outright are dropped;
 * options that merely need an extra condition come back disabled with a reason,
 * so the employee understands the rule instead of hunting for a missing button.
 */
export function eligibleModes(policy: Policy, ctx: EligibilityContext): ModeOption[] {
  const band = bandPolicy(policy, ctx.band);
  const spec = (mode: string) => policy.modes.find((m) => m.mode === mode);
  const label = (mode: string) => spec(mode)?.label || mode;
  const out: ModeOption[] = [];
  const push = (mode: string, enabled: boolean, reason = "") => {
    const s = spec(mode);
    if (!s) return;
    out.push({ mode, label: label(mode), enabled, reason, requiresReceipt: s.requiresReceipt });
  };

  if (ctx.scope === "inside") {
    const isFemale = String(ctx.gender).toLowerCase().startsWith("f");
    const allowed = (isFemale ? band?.modesFemale : band?.modesMale) ?? [];
    const teamMin = cfgNum(policy, "TEAM_CAR_MIN_MEMBERS", 3);

    for (const mode of ["Rickshaw", "Bike", "CNG", "Car"]) {
      const inBand = allowed.includes(mode);
      if (mode === "Car") {
        // Car is the only option with conditions layered on top of the band list.
        if (ctx.travelType === "team") {
          if (ctx.teamSize >= teamMin) push("Car", true);
          else push("Car", false, `Car needs at least ${teamMin} travellers — currently ${ctx.teamSize}.`);
        } else if (inBand) {
          push("Car", true);
        } else if (ctx.carSpecialApproval) {
          push("Car", true, "");
        } else {
          push("Car", false, "Your band needs pre-approval for Car. Tick “Car pre-approved” to claim it.");
        }
        continue;
      }
      // A bike carries one person, so it is never a team option — no matter
      // how large the team is.
      if (ctx.travelType === "team" && mode === "Bike") {
        push("Bike", false, "Bike is not available for team travel.");
        continue;
      }
      if (inBand) push(mode, true);
    }

    push("CompanyVehicle", true);
    push("PersonalVehicle", true);
    push("RideSharing", true);
    return out;
  }

  // Outside city.
  for (const s of policy.modes) {
    if (s.scope === "Inside") continue;
    if (s.mode === "Flight") {
      if (band?.flightEligible) push("Flight", true);
      else push("Flight", false, `Flight is not available for Band ${ctx.band}.`);
      continue;
    }
    if (s.mode === "RentACar") {
      if (band?.carPoolEligible) push("RentACar", true);
      else push("RentACar", false, `Rent-a-car pooling is not available for Band ${ctx.band}.`);
      continue;
    }
    push(s.mode, true);
  }
  return out;
}

// ── the calculation ─────────────────────────────────────────────────────────


/**
 * Turns a draft plus the employee's profile into every amount, note, warning
 * and blocking error. Callers show `errors` as hard blocks (submit disabled)
 * and `warnings` as things an approver will have to look at.
 */
export function computeRequest(policy: Policy, draft: RequestDraft, user: SessionUser): Computation {
  const notes: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  const band = bandPolicy(policy, user.band);
  if (!band) errors.push(`No policy is configured for Band "${user.band}". Contact Administration.`);

  const span = daySpan(draft.fromDate, draft.toDate || draft.fromDate);
  const tripDays = span.total;
  const hours = workingHours(draft.startTime, draft.endTime);

  const teamSize = draft.travelType === "team" ? draft.teamMembers.length + 1 : 1;

  // ── Transportation ────────────────────────────────────────────────────────
  let taAmount = 0;
  let fuelRate = 0;
  const legTotal = draft.legs.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);

  if (draft.scope === "inside") {
    {
      if (draft.transportMode === "CompanyVehicle") {
        taAmount = 0;
        notes.push("Company vehicle used — no transport reimbursement is payable.");
      } else if (draft.transportMode === "PersonalVehicle") {
        fuelRate = fuelRateFor(policy, draft.vehicleType);
        taAmount = money((Number(draft.totalKM) || 0) * fuelRate);
        notes.push(
          `Personal ${draft.vehicleType || "vehicle"}: ${draft.totalKM || 0} km × ${fuelRate} ${cfgStr(policy, "CURRENCY", "BDT")}/km = ${money(taAmount)}.`,
        );
      } else {
        taAmount = money(legTotal);
        if (draft.transportMode) notes.push("Inside-city transport is reimbursed against actual receipts.");
      }
    }
  } else {
    // Outside city: intercity fares are reimbursed at actual against receipts.
    taAmount = money(legTotal);
    if (legTotal > 0) notes.push("Intercity travel is reimbursed at actual against tickets/receipts.");
  }

  // ── Per-Diem and lunch ────────────────────────────────────────────────────
  let perDiemEligible = false;
  let perDiemDays = 0;
  let perDiemAmount = 0;
  let lunchEligible = false;
  let lunchAllowance = 0;

  // A dual-workstation day always counts as a company-meal day.
  const officeMeal = draft.dualWorkstation ? true : draft.officeMealTaken;

  if (draft.scope === "outside") {
    const taken = policy.routes.find((r) => r.value === draft.route);
    if (taken) {
      notes.push(
        `Outside-city travel ${taken.from} to ${draft.city || taken.to} — per-diem, accommodation and intercity fare rules apply instead of the inside-city ones.`,
      );
    }
    perDiemEligible = tripDays > 0;
    perDiemDays = tripDays;
    perDiemAmount = money(span.weekday * (band?.outsideTAWeekday ?? 0) + span.weekend * (band?.outsideTAWeekend ?? 0));
    if (perDiemEligible) {
      notes.push(
        `Outside-city Per-Diem for Band ${user.band}: ${span.weekday} weekday × ${band?.outsideTAWeekday ?? 0} + ${span.weekend} weekend × ${band?.outsideTAWeekend ?? 0} = ${perDiemAmount}. This already covers local transport and 3 meals.`,
      );
    }
  } else {
    const minHours = cfgNum(policy, "PER_DIEM_MIN_HOURS", 5);
    if (hours >= minHours) {
      perDiemEligible = true;
      perDiemDays = 1;
      perDiemAmount = cfgNum(policy, "PER_DIEM_AMOUNT", 250);
      notes.push(`Worked ${hours} hours (≥ ${minHours}) — Per-Diem ${perDiemAmount} approved automatically. Lunch is included, so lunch allowance is not payable.`);
    } else if (draft.workedDuringLunch) {
      if (officeMeal) {
        notes.push("Office meal was provided — lunch allowance is not payable (no duplicate meal claim).");
      } else {
        lunchEligible = true;
        lunchAllowance = cfgNum(policy, "LUNCH_ALLOWANCE", 150);
        notes.push(`Worked ${hours} hours (< ${minHours}) through the lunch window — lunch allowance ${lunchAllowance} applies.`);
      }
    } else if (hours > 0) {
      notes.push(`Worked ${hours} hours (< ${minHours}) and not through lunch — no Per-Diem or lunch allowance.`);
    }
  }

  if (draft.dualWorkstation) {
    notes.push(`Dual workstation (${draft.dualWorkstationType || "unspecified"}) — TA and Per-Diem are allowed, company meal is assumed, duplicate meal claims are blocked.`);
    if (!draft.dualWorkstationType) errors.push("Select a dual-workstation reason.");
  }

  // ── Accommodation ─────────────────────────────────────────────────────────
  const nights = draft.checkIn && draft.checkOut
    ? Math.max(1, Math.round((new Date(`${draft.checkOut}T00:00:00`).getTime() - new Date(`${draft.checkIn}T00:00:00`).getTime()) / 86_400_000))
    : 0;
  const perNightLimit = band?.accommodationLimit ?? 0;
  const accommodationLimit = money(perNightLimit * (nights || 1));
  let accommodationAmount = money(Number(draft.accommodationAmount) || 0);

  if (accommodationAmount > 0) {
    if (draft.scope !== "outside") {
      errors.push("Accommodation can only be claimed for outside-city travel.");
      accommodationAmount = 0;
    } else {
      if (!draft.hotelName) errors.push("Hotel name is required for an accommodation claim.");
      if (!draft.checkIn || !draft.checkOut) errors.push("Check-in and check-out dates are required for an accommodation claim.");
      if (accommodationAmount > accommodationLimit && accommodationLimit > 0) {
        errors.push(
          `Accommodation ${accommodationAmount} exceeds the Band ${user.band} limit of ${perNightLimit}/night × ${nights || 1} night(s) = ${accommodationLimit}.`,
        );
      } else if (accommodationLimit > 0) {
        notes.push(`Accommodation within the Band ${user.band} limit (${perNightLimit}/night × ${nights || 1} = ${accommodationLimit}).`);
      }
    }
  }

  // ── Rent-a-car / car pool ─────────────────────────────────────────────────
  let rentACarAmount = money(Number(draft.rentACarAmount) || 0);
  if (rentACarAmount > 0) {
    const minHead = cfgNum(policy, "RENT_A_CAR_MIN_HEADCOUNT", 3);
    const limit = cfgNum(policy, "RENT_A_CAR_LIMIT", 6000);
    const head = Number(draft.rentACarHeadcount) || 0;
    if (!band?.carPoolEligible) {
      errors.push(`Rent-a-car pooling is not available for Band ${user.band}.`);
      rentACarAmount = 0;
    } else if (head < minHead) {
      errors.push(`Rent-a-car needs at least ${minHead} employees — ${head} entered. Request rejected by policy.`);
      rentACarAmount = 0;
    } else if (rentACarAmount > limit) {
      warnings.push(`Rent-a-car ${rentACarAmount} exceeds the ${limit} one-way limit — this needs special approval.`);
    } else {
      notes.push(`Rent-a-car pooled across ${head} employees, within the ${limit} one-way limit.`);
    }
  }

  // ── Flight ────────────────────────────────────────────────────────────────
  let flightAmount = money(Number(draft.flightAmount) || 0);
  if (flightAmount > 0 && !band?.flightEligible) {
    errors.push(`Flight is not available for Band ${user.band}.`);
    flightAmount = 0;
  }

  const otherAmount = money(Number(draft.otherAmount) || 0);
  if (otherAmount > 0 && !draft.otherNote) warnings.push("Explain the “other” amount so Finance can verify it.");

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalClaim = money(taAmount + perDiemAmount + lunchAllowance + accommodationAmount + rentACarAmount + flightAmount + otherAmount);

  // ── Advance ───────────────────────────────────────────────────────────────
  const advanceMinDays = cfgNum(policy, "ADVANCE_MIN_TRIP_DAYS", 3);
  const advanceAvailable = draft.scope === "outside" && tripDays > advanceMinDays;
  let advanceRequested = money(Number(draft.advanceRequested) || 0);
  if (advanceRequested > 0 && !advanceAvailable) {
    errors.push(`An advance is only available for outside-city trips longer than ${advanceMinDays} days.`);
    advanceRequested = 0;
  }
  const deptHeadLimit = cfgNum(policy, "ADVANCE_AUTO_LIMIT", 10000);
  const requiresDeptHeadApproval = advanceRequested > deptHeadLimit;
  if (advanceRequested > 0) {
    notes.push(
      requiresDeptHeadApproval
        ? `Advance ${advanceRequested} is above ${deptHeadLimit} — Line Manager, HR and Department Head approval required.`
        : `Advance ${advanceRequested} — Line Manager and HR approval required.`,
    );
    notes.push(`Settlement is due within ${cfgNum(policy, "ADVANCE_SETTLEMENT_DAYS", 3)} working days of the trip ending.`);
  }

  const finalPayable = money(totalClaim - advanceRequested);

  // The claim type is a result, not a question: whatever the policy actually
  // paid out is what this claim is. Nobody is asked to pick it any more.
  const paidTA = taAmount > 0;
  const paidPerDiem = perDiemAmount > 0 || lunchAllowance > 0;
  const claimType: ClaimType = paidTA && paidPerDiem ? "both" : paidPerDiem ? "perdiem" : "ta";
  if (draft.scope === "inside" && (paidTA || paidPerDiem)) {
    notes.push(
      `Claim resolved automatically as ${
        { ta: "TA only", perdiem: "Per-Diem only", both: "TA + Per-Diem" }[claimType]
      } — from the hours and transport entered, not from a choice.`,
    );
  }

  // ── Cross-field validation ────────────────────────────────────────────────
  if (!draft.fromDate) errors.push("Travel date is required.");
  if (!draft.purpose) errors.push("Purpose is required.");
  if (draft.scope === "inside") {
    // Inside-city trips pick the destination from a list; what that choice
    // asks for next decides what still has to be filled in.
    const chosen = policy.destinationTypes.find(
      (d) => d.value === draft.destinationType && (!d.cities.length || d.cities.includes(draft.city)),
    );
    if (!chosen) errors.push("Select a destination.");
    else if (chosen.needs === "name" && !draft.destination) {
      errors.push(`${chosen.label} name is required.`);
    }
    if (cityZone(policy, draft.city) === "Outside") errors.push(`${draft.city} is not an inside-city location.`);
    if (!draft.startTime || !draft.endTime) errors.push("Start and end time are required to calculate Per-Diem.");
    if (!draft.workedAt) errors.push("Select where you worked.");
    if (!draft.transportMode) errors.push("Select a mode of transport.");
    if (draft.transportMode === "PersonalVehicle") {
      if (!draft.vehicleType) errors.push("Select the personal vehicle type.");
      if (!(Number(draft.totalKM) > 0)) errors.push("Total KM is required for a personal vehicle claim.");
      if (!draft.travelFrom || !draft.travelTo) errors.push("Travel from and to are required for a personal vehicle claim.");
    }
    if (draft.transportMode === "RideSharing" && legTotal <= 0) {
      errors.push("Add at least one ride-sharing trip with its amount and receipt.");
    }
  } else {
    if (!draft.toDate) errors.push("Return date is required for outside-city travel.");
    if (tripDays <= 0) errors.push("The return date cannot be before the travel date.");
    // Outside-city travel is described by a route, not by a district: Dhaka to
    // Chattogram is outside-city even though Chattogram is an inside-city
    // location in its own right, so the city's zone cannot decide this.
    const taken = policy.routes.find((r) => r.value === draft.route);
    if (!taken) errors.push("Select a route.");
    else if (!draft.city) errors.push(`Which city did you travel to from ${taken.from}?`);
    else if (taken.to && draft.city !== taken.to) errors.push(`${taken.label} must end in ${taken.to}.`);
    if (draft.arrangement === "company") {
      const notice = cfgNum(policy, "COMPANY_ARRANGE_NOTICE_DAYS", 2);
      const available = businessDaysUntil(draft.fromDate);
      if (available < notice) {
        errors.push(
          `Company-arranged travel requires at least ${notice} business days' notice. Please choose Self Arrangement or contact Administration.`,
        );
      } else {
        notes.push(`Company arrangement requested with ${available} business days' notice — Administration will be notified automatically.`);
      }
    }
  }

  if (draft.travelType === "team") {
    if (draft.teamMembers.length < 1) errors.push("Add at least one team member, or switch back to Individual travel.");
    else notes.push(`Team travel with ${teamSize} travellers.`);
  }

  // ── Where the money goes ──────────────────────────────────────────────────
  const bkash = String(draft.bkashNumber || "").replace(/[\s-]/g, "");
  if (finalPayable > 0) {
    if (!bkash) {
      errors.push("Enter the bKash number the payment should go to.");
    } else if (!/^01[3-9]\d{8}$/.test(bkash)) {
      errors.push("That bKash number does not look right — it should be 11 digits starting 01, e.g. 01712345678.");
    }
  }

  // ── Document links ────────────────────────────────────────────────────────
  const links = draft.documentLinks.filter(Boolean);
  const malformed = links.filter((l) => !/^https?:\/\/\S+$/i.test(l));
  if (malformed.length) {
    errors.push(`These are not valid links: ${malformed.slice(0, 3).join(", ")}. Paste the full URL starting with https://`);
  }
  if (links.length && !draft.documentTypes.length) {
    errors.push("Select which document type(s) your links cover.");
  }
  if (cfgStr(policy, "REQUIRE_DOCUMENT_LINK", "Yes").toLowerCase() === "yes" && totalClaim > 0 && !links.length) {
    errors.push("Share at least one document link (Drive, bill, ticket or receipt) supporting this claim.");
  }
  if (links.some((l) => /drive\.google\.com|docs\.google\.com/i.test(l))) {
    notes.push(`${links.length} document link(s) attached — approvers open them directly, so keep the Drive sharing open to them.`);
  }

  // The chosen mode must still be legal for this employee.
  if (draft.transportMode) {
    const opts = eligibleModes(policy, {
      band: user.band,
      gender: user.gender,
      scope: draft.scope,
      travelType: draft.travelType,
      teamSize,
      carSpecialApproval: draft.carSpecialApproval,
    });
    const chosen = opts.find((o) => o.mode === draft.transportMode);
    if (!chosen) errors.push(`${draft.transportMode} is not available for Band ${user.band}.`);
    else if (!chosen.enabled) errors.push(chosen.reason);
  }

  return {
    workingHours: hours,
    tripDays,
    weekdayDays: span.weekday,
    weekendDays: span.weekend,
    claimType,
    taAmount: money(taAmount),
    perDiemEligible,
    perDiemDays,
    perDiemAmount: money(perDiemAmount),
    lunchEligible,
    lunchAllowance: money(lunchAllowance),
    accommodationAmount,
    accommodationLimit,
    rentACarAmount,
    flightAmount,
    otherAmount,
    totalClaim,
    advanceRequested,
    finalPayable,
    advanceAvailable,
    requiresDeptHeadApproval,
    notes,
    errors,
    warnings,
  };
}

/** Fresh draft with every field defined, so React inputs stay controlled. */
export function emptyDraft(scope: Scope = "inside"): RequestDraft & { carSpecialApproval: boolean } {
  const today = new Date().toISOString().slice(0, 10);
  return {
    scope,
    city: scope === "inside" ? "Dhaka" : "",
    claimType: "both",
    travelType: "individual",
    teamMembers: [],
    fromDate: today,
    toDate: today,
    purpose: "",
    destinationType: "",
    route: "",
    destination: "",
    startTime: "",
    endTime: "",
    workedAt: "",
    arrangement: "self",
    transportMode: "",
    vehicleType: "",
    travelFrom: "",
    travelTo: "",
    totalKM: 0,
    legs: [],
    workedDuringLunch: false,
    officeMealTaken: false,
    dualWorkstation: false,
    dualWorkstationType: "",
    hotelName: "",
    checkIn: "",
    checkOut: "",
    accommodationAmount: 0,
    rentACarAmount: 0,
    rentACarHeadcount: 0,
    flightAmount: 0,
    otherAmount: 0,
    otherNote: "",
    advanceRequested: 0,
    bkashNumber: "",
    documentTypes: [],
    documentLinks: [],
    employeeNote: "",
    carSpecialApproval: false,
  };
}
