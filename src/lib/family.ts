import { useSyncExternalStore } from "react";

export type Child = {
  id: string;
  firstName: string;
  lastName: string;
  dob: string;
  medical?: string;
  gender?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  school?: string;
  grade?: string;
  healthCard?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  emergencyRelationship?: string;
  /** Seasons (e.g. "Summer 2027") for which the parent confirmed this profile is current. */
  confirmedSeasons?: string[];
  /** Shipper Cloud children row id once synced. */
  cloudId?: string;
};

export type RegDetails = { heardAbout?: string; jerseySize?: string; pickupPerson?: string; answers?: { question: string; answer: string }[]; waivers: string[]; acceptedAt: string; signature?: string; waiverSnapshot?: WaiverSnapshot[] };

export type WaiverSnapshot = { id: string; title: string; text: string };

export type Guardian = { name: string; email: string; phone: string; relationship?: string };

export type RegStatus = "confirmed" | "transferred" | "credited" | "refund_pending" | "refunded";

export type RefundRequest = {
  id: string;
  registrationId: string;
  paid: number;
  adminFee: number;
  refund: number;
  reason?: string;
  description: string;
  status: "pending" | "approved" | "declined" | "cancelled";
  createdAt: string;
  processedAt?: string;
};

export type Registration = {
  id: string;
  lineId: string;
  childId: string;
  friendRequest: string;
  jerseySize?: string;
  pickupPerson?: string;
  answers?: { question: string; answer: string }[];
  heardAbout?: string;
  waivers?: string[];
  waiverSnapshot?: WaiverSnapshot[];
  signature?: string;
  signedAt?: string;
  amount: number;
  tax: number;
  createdAt: string;
  status?: RegStatus;
  /** For transferred registrations: the id of the new registration. */
  transferredTo?: string;
  /** Shipper Cloud registrations row id once synced. */
  cloudId?: string;
};

export type LedgerType = "payment" | "refund" | "credit" | "credit_used" | "transfer";

export type LedgerEntry = {
  id: string;
  date: string;
  type: LedgerType;
  description: string;
  /** Positive = money/credit to family, negative = charge. */
  amount: number;
};

type FamilyState = {
  /** Asked once when the parent first creates their account. */
  heardAbout?: string;
  guardian: Guardian;
  guardian2?: Guardian;
  children: Child[];
  friendRequests: Record<string, string>;
  regDetails: Record<string, RegDetails>;
  registrations: Registration[];
  ledger: LedgerEntry[];
  credit: number;
  refundRequests: RefundRequest[];
};

/** Admin fee withheld when a family requests a refund back to their card. */
export const REFUND_ADMIN_FEE = 50;

const KEY = "top_family_v2";

/** Empty family for new visitors — no demo data ever ships to parents. */
const SEED: FamilyState = {
  guardian: { name: "", email: "", phone: "" },
  children: [],
  friendRequests: {},
  regDetails: {},
  registrations: [],
  ledger: [],
  credit: 0,
  refundRequests: [],
};

/** Old demo records from earlier builds — stripped if still in a browser. */
const DEMO_CHILD_IDS = new Set(["c-maya", "c-leo"]);
function stripDemo(s: FamilyState): FamilyState {
  const isDemoGuardian = s.guardian?.email === "jordan.whitfield@gmail.com";
  return {
    ...s,
    guardian: isDemoGuardian ? SEED.guardian : s.guardian ?? SEED.guardian,
    children: (s.children ?? []).filter((c) => !DEMO_CHILD_IDS.has(c.id)),
    registrations: (s.registrations ?? []).filter((r) => !r.id.startsWith("r-seed") && !DEMO_CHILD_IDS.has(r.childId)),
    ledger: (s.ledger ?? []).filter((l) => !l.id.startsWith("l-seed")),
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const uid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;

function load(): FamilyState {
  if (typeof window === "undefined") return SEED;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return SEED;
    const parsed = stripDemo({ ...SEED, ...JSON.parse(raw) } as FamilyState);
    return { ...parsed, refundRequests: parsed.refundRequests ?? [], regDetails: parsed.regDetails ?? {} };
  } catch {
    return SEED;
  }
}

let state: FamilyState = load();
const listeners = new Set<() => void>();

function set(next: Partial<FamilyState>) {
  state = { ...state, ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Wipe all family data saved in this browser (sign-out / shared computers). */
export function clearFamily() {
  state = { ...SEED };
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem("top_cloud_credit_cents");
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function log(entry: Omit<LedgerEntry, "id" | "date">): LedgerEntry {
  return { ...entry, id: uid("l"), date: new Date().toISOString() };
}

export function useFamily() {
  const s = useSyncExternalStore(subscribe, () => state, () => SEED);
  return {
    ...s,
    childById: (id: string) => s.children.find((c) => c.id === id),
    updateGuardian: (g: Guardian) => set({ guardian: g }),
    setHeardAbout: (v: string) => set({ heardAbout: v }),
    updateGuardian2: (g: Guardian | undefined) => set({ guardian2: g }),
    setRegCloudId: (regId: string, cloudId: string) =>
      set({ registrations: state.registrations.map((r) => (r.id === regId ? { ...r, cloudId } : r)) }),
    setChildCloudId: (childId: string, cloudId: string) =>
      set({ children: state.children.map((c) => (c.id === childId ? { ...c, cloudId } : c)) }),
    addChild: (c: Omit<Child, "id">): Child => {
      const child = { ...c, id: uid("c") };
      set({ children: [...state.children, child] });
      return child;
    },
    updateChild: (c: Child) => set({ children: state.children.map((x) => (x.id === c.id ? c : x)) }),
    removeChild: (id: string) => set({ children: state.children.filter((c) => c.id !== id) }),
    setFriendRequest: (lineId: string, value: string) =>
      set({ friendRequests: { ...state.friendRequests, [lineId]: value } }),
    setRegDetails: (lineId: string, value: RegDetails) =>
      set({ regDetails: { ...state.regDetails, [lineId]: value } }),
    addRegistrations: (regs: Registration[], describe?: (r: Registration) => string) =>
      set({
        registrations: [...regs.map((r) => ({ ...r, status: r.status ?? ("confirmed" as const) })), ...state.registrations],
        ledger: [
          ...regs.map((r) => log({ type: "payment", description: describe ? describe(r) : "Registration payment", amount: -r2(r.amount + r.tax) })),
          ...state.ledger,
        ],
      }),
    spendCredit: (amount: number) =>
      set({
        credit: Math.max(0, r2(state.credit - amount)),
        ledger: [log({ type: "credit_used", description: "Account credit applied at checkout", amount: -r2(amount) }), ...state.ledger],
      }),

    /** Move a registration to another session of the same program. Price difference settles via account credit. */
    transferRegistration: (regId: string, newLineId: string, newAmount: number, newTax: number, description: string) => {
      const old = state.registrations.find((r) => r.id === regId);
      if (!old) return { ok: false as const, error: "Registration not found" };
      const diff = r2(old.amount + old.tax - (newAmount + newTax)); // + = family is owed
      if (diff < 0 && state.credit < -diff) {
        return { ok: false as const, error: `This option costs ${Math.abs(diff).toFixed(2)} more — not enough account credit.` };
      }
      const next: Registration = { ...old, cloudId: undefined, id: uid("r"), lineId: newLineId, amount: newAmount, tax: newTax, createdAt: new Date().toISOString(), status: "confirmed" };
      const entries: LedgerEntry[] = [log({ type: "transfer", description, amount: 0 })];
      if (diff > 0) entries.unshift(log({ type: "credit", description: "Price difference from transfer", amount: diff }));
      if (diff < 0) entries.unshift(log({ type: "credit_used", description: "Credit applied to transfer upgrade", amount: diff }));
      set({
        registrations: [next, ...state.registrations.map((r) => (r.id === regId ? { ...r, status: "transferred" as const, transferredTo: next.id } : r))],
        credit: r2(state.credit + diff),
        ledger: [...entries, ...state.ledger],
      });
      return { ok: true as const, diff, newId: next.id };
    },

    /**
     * Withdraw from a registration.
     * - "credit": full paid value lands in account credit immediately.
     * - "refund": opens a pending refund request (paid less admin fee) for staff review.
     */
    cancelRegistration: (regId: string, method: "credit" | "refund", description: string, reason?: string) => {
      const reg = state.registrations.find((r) => r.id === regId);
      if (!reg || (reg.status ?? "confirmed") !== "confirmed") return { ok: false as const, amount: 0, pending: false };
      const paid = r2(reg.amount + reg.tax);
      if (method === "credit") {
        set({
          registrations: state.registrations.map((r) => (r.id === regId ? { ...r, status: "credited" as const } : r)),
          credit: r2(state.credit + paid),
          ledger: [log({ type: "credit", description: `Account credit — ${description}`, amount: paid }), ...state.ledger],
        });
        return { ok: true as const, amount: paid, pending: false };
      }
      const adminFee = Math.min(paid, REFUND_ADMIN_FEE);
      const refund = r2(paid - adminFee);
      const nowIso = new Date().toISOString();
      const request: RefundRequest = { id: uid("rr"), registrationId: regId, paid, adminFee, refund, reason: reason?.trim() || undefined, description, status: "approved", createdAt: nowIso, processedAt: nowIso };
      set({
        registrations: state.registrations.map((r) => (r.id === regId ? { ...r, status: "refunded" as const } : r)),
        refundRequests: [request, ...(state.refundRequests ?? [])],
        ledger: [log({ type: "refund", description: `Refund to card — ${description} (less ${REFUND_ADMIN_FEE.toFixed(2)} admin fee)`, amount: refund }), ...state.ledger],
      });
      return { ok: true as const, amount: refund, pending: false };
    },

    /** Family cancels their own pending refund request — the spot is restored. */
    cancelRefundRequest: (regId: string) => {
      const req = (state.refundRequests ?? []).find((q) => q.registrationId === regId && q.status === "pending");
      if (!req) return false;
      set({
        refundRequests: state.refundRequests.map((q) => (q.id === req.id ? { ...q, status: "cancelled" as const, processedAt: new Date().toISOString() } : q)),
        registrations: state.registrations.map((r) => (r.id === regId ? { ...r, status: "confirmed" as const } : r)),
      });
      return true;
    },

    /** Staff decision on a pending refund. Approval writes the refund to the ledger. */
    processRefundRequest: (requestId: string, decision: "approved" | "declined") => {
      const req = (state.refundRequests ?? []).find((q) => q.id === requestId);
      if (!req || req.status !== "pending") return false;
      const now = new Date().toISOString();
      set({
        refundRequests: state.refundRequests.map((q) => (q.id === requestId ? { ...q, status: decision, processedAt: now } : q)),
        registrations: state.registrations.map((r) =>
          r.id === req.registrationId ? { ...r, status: decision === "approved" ? ("refunded" as const) : ("confirmed" as const) } : r,
        ),
        ledger:
          decision === "approved"
            ? [log({ type: "refund", description: `Refund to card — ${req.description} (less ${REFUND_ADMIN_FEE.toFixed(2)} admin fee)`, amount: req.refund }), ...state.ledger]
            : state.ledger,
      });
      return true;
    },
    pendingRefundFor: (regId: string) => (s.refundRequests ?? []).find((q) => q.registrationId === regId && q.status === "pending"),
  };
}
