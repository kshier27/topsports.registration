import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useSession } from "@/lib/auth-client";
import { clearFamily, useFamily, type Registration } from "@/lib/family";
import { decodeLine } from "@/data/registration";

/** Credit (cents) applied at the last checkout, still to be recorded in the cloud ledger. */
export const CLOUD_CREDIT_KEY = "top_cloud_credit_cents";

const cents = (n: number) => Math.round(n * 100);

type Task = { key: string; run: () => Promise<unknown> | unknown };

/**
 * Mounted once in the root layout. While a family is signed in, it mirrors
 * their registrations, payments, transfers, credits and refund requests into
 * Shipper Cloud (so staff reports, attendance and the refund queue see them),
 * and pulls staff refund decisions back into My Schedule.
 */
export function CloudSync() {
  const { data: session, isPending } = useSession();
  const signedIn = !!session;
  const fam = useFamily();
  // Data that was synced to an account must never show to a signed-out visitor.
  useEffect(() => {
    if (isPending || session) return;
    if (fam.children.some((c) => c.cloudId) || fam.registrations.some((r) => r.cloudId)) clearFamily();
  }, [isPending, session, fam]);
  const account = useQuery(api.registrationOps.getAccount, signedIn ? {} : "skip");
  const mine = useQuery(api.registrationOps.myRegistrations, signedIn ? {} : "skip");
  const createReg = useMutation(api.mutations.createRegistration);
  const createChild = useMutation(api.mutations.createChildren);
  const recordPayment = useMutation(api.registrationOps.recordPayment);
  const transfer = useMutation(api.registrationOps.transferRegistration);
  const withdraw = useMutation(api.registrationOps.withdrawRegistration);
  const cancelRefund = useMutation(api.registrationOps.cancelRefundRequest);
  const busy = useRef(false);
  const failed = useRef(new Set<string>());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!signedIn || !session || !mine || !account || busy.current) return;
    const cloud = new Map(mine.map((r) => [r._id as string, r]));
    const regs = fam.registrations;
    const label = (r: Registration) => {
      const d = decodeLine(r.lineId);
      const name = fam.childById(r.childId)?.firstName ?? "Child";
      return d ? `${name}, ${d.program.name} (${d.session.label})` : name;
    };

    const find = (): Task | null => {
      // 1. Reconcile changes on registrations that already live in the cloud.
      for (const r of regs) {
        if (!r.cloudId) continue;
        const c = cloud.get(r.cloudId);
        if (!c) continue;
        const local = r.status ?? "confirmed";
        const cloudId = r.cloudId as Id<"registrations">;
        if (local === "transferred" && c.status === "confirmed" && r.transferredTo) {
          const target = regs.find((x) => x.id === r.transferredTo);
          const d = target ? decodeLine(target.lineId) : null;
          if (target && d && !target.cloudId)
            return {
              key: `transfer:${r.id}`,
              run: async () => {
                const res = await transfer({ id: cloudId, sessionId: d.session.id, amountCents: cents(target.amount + target.tax), description: `Transfer — ${label(r)} → ${d.session.label}` });
                fam.setRegCloudId(target.id, res.id);
              },
            };
        }
        if (local === "refunded" && c.status === "confirmed") {
          const req = fam.refundRequests.find((q) => q.registrationId === r.id && q.status === "approved");
          return { key: `autorefund:${r.id}`, run: () => withdraw({ id: cloudId, method: "refund", description: label(r), reason: req?.reason }) };
        }
        if (local === "credited" && c.status === "confirmed")
          return { key: `credit:${r.id}`, run: () => withdraw({ id: cloudId, method: "credit", description: label(r) }) };
        if (local === "refund_pending" && c.status === "confirmed") {
          const req = fam.refundRequests.find((q) => q.registrationId === r.id && q.status === "pending");
          const since = req ? Date.parse(req.createdAt) : 0;
          const declined = account.refunds.find((q) => q.registrationId === r.cloudId && q.status === "declined" && (q.processedAt ?? 0) > since);
          if (declined && req) return { key: `decline:${req.id}`, run: () => fam.processRefundRequest(req.id, "declined") };
          return { key: `refund:${r.id}:${req?.id ?? ""}`, run: () => withdraw({ id: cloudId, method: "refund", description: label(r), reason: req?.reason }) };
        }
        if (local === "refund_pending" && c.status === "refunded") {
          const req = fam.refundRequests.find((q) => q.registrationId === r.id && q.status === "pending");
          if (req) return { key: `approve:${req.id}`, run: () => fam.processRefundRequest(req.id, "approved") };
        }
        if (local === "confirmed" && c.status === "refund_pending") {
          const q = account.refunds.find((x) => x.registrationId === r.cloudId && x.status === "pending");
          if (q) return { key: `cancel:${q._id}`, run: () => cancelRefund({ id: q._id }) };
        }
      }
      // 2. Upload registrations made on this device that aren't in the cloud yet.
      const pendingTargets = new Set(regs.filter((r) => r.cloudId && r.transferredTo).map((r) => r.transferredTo as string));
      for (const r of regs) {
        if (r.cloudId || r.id.startsWith("r-seed") || pendingTargets.has(r.id) || (r.status ?? "confirmed") !== "confirmed") continue;
        const d = decodeLine(r.lineId);
        const child = fam.childById(r.childId);
        if (!d || !child) continue;
        return {
          key: `upload:${r.id}`,
          run: async () => {
            let childCloud = child.cloudId;
            if (!childCloud) {
              childCloud = await createChild({ firstName: child.firstName, lastName: child.lastName, dob: child.dob, medicalNotes: child.medical || undefined, address: child.address ? `${child.address}, ${child.city ?? ""} ${child.postalCode ?? ""}`.trim() : undefined, school: child.school || undefined, emergencyContact: child.emergencyName ? `${child.emergencyName}${child.emergencyRelationship ? ` (${child.emergencyRelationship})` : ""} ${child.emergencyPhone ?? ""}`.trim() : undefined });
              fam.setChildCloudId(child.id, childCloud);
            }
            const paid = cents(r.amount + r.tax);
            const id = await createReg({
              programId: d.program.id,
              locationSlug: d.program.locationSlug,
              sessionId: d.session.id,
              childName: `${child.firstName} ${child.lastName}`.trim(),
              childDob: child.dob,
              parentName: fam.guardian.name || session.user.name || "",
              parentEmail: session.user.email || fam.guardian.email,
              friendRequest: r.friendRequest || undefined,
              jerseySize: r.jerseySize || undefined,
              authorizedPickup: r.pickupPerson || undefined,
              customAnswers: d.slot ? [{ question: "Time Slot", answer: d.slot.label }, ...(r.answers ?? [])] : r.answers?.length ? r.answers : undefined,
              heardAbout: r.heardAbout || undefined,
              parentPhone: fam.guardian.phone || undefined,
              guardian2Name: fam.guardian2?.name || undefined,
              guardian2Email: fam.guardian2?.email || undefined,
              guardian2Phone: fam.guardian2?.phone || undefined,
              waiversAccepted: r.waivers,
              waiverSnapshot: r.waiverSnapshot?.length ? r.waiverSnapshot : undefined,
              signatureName: r.signature || undefined,
              signedAt: r.signedAt ? new Date(r.signedAt).getTime() : undefined,
              childAddress: child.address ? `${child.address}, ${child.city ?? ""} ${child.postalCode ?? ""}`.trim() : undefined,
              childSchool: child.school ? `${child.school}${child.grade ? ` (${child.grade})` : ""}` : undefined,
              emergencyContact: child.emergencyName ? `${child.emergencyName}${child.emergencyRelationship ? ` (${child.emergencyRelationship})` : ""} ${child.emergencyPhone ?? ""}`.trim() : undefined,
              amountCents: paid,
              status: "confirmed",
            });
            fam.setRegCloudId(r.id, id);
            const pendingCredit = Number(sessionStorage.getItem(CLOUD_CREDIT_KEY) ?? 0) || 0;
            const use = Math.max(0, Math.min(pendingCredit, account.creditCents, paid));
            if (pendingCredit > 0) sessionStorage.setItem(CLOUD_CREDIT_KEY, String(pendingCredit - use));
            await recordPayment({ registrationId: id, description: `Payment — ${label(r)}`, creditUsedCents: use > 0 ? use : undefined });
          },
        };
      }
      return null;
    };

    const task = find();
    if (!task || failed.current.has(task.key)) return;
    busy.current = true;
    void (async () => {
      try {
        await task.run();
      } catch (e) {
        failed.current.add(task.key);
        console.warn("Shipper Cloud sync skipped:", task.key, e);
      } finally {
        busy.current = false;
        setTick((t) => t + 1);
      }
    })();
  }, [signedIn, session, mine, account, fam, tick, createReg, createChild, recordPayment, transfer, withdraw, cancelRefund]);

  return null;
}
