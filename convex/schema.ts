import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Better Auth tables (user, session, account, verification) are managed
  // automatically by the @convex-dev/better-auth component.

  // AUTH STATS - Signup tracking for Shipper analytics dashboard
  // Platform-managed table. Leave this intact.
  authStats: defineTable({
    date: v.string(),        // ISO date string "2024-01-15"
    provider: v.string(),    // "email", "google", "anonymous"
    signups: v.number(),     // Count of signups
    lastUpdated: v.number(), // Timestamp
  })
    .index("date_provider", ["date", "provider"])
    .index("date", ["date"]),

  // Application tables
  children: defineTable({
    userId: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    dob: v.string(),
    medicalNotes: v.optional(v.string()),
    address: v.optional(v.string()),
    school: v.optional(v.string()),
    emergencyContact: v.optional(v.string()),
  })
    .index("by_user", ["userId"]),

  registrations: defineTable({
    userId: v.string(),
    programId: v.string(),
    locationSlug: v.string(),
    sessionId: v.string(),
    childName: v.string(),
    childDob: v.string(),
    parentName: v.string(),
    parentEmail: v.string(),
    friendRequest: v.optional(v.string()),
    jerseySize: v.optional(v.string()),
    heardAbout: v.optional(v.string()),
    parentPhone: v.optional(v.string()),
    guardian2Name: v.optional(v.string()),
    guardian2Email: v.optional(v.string()),
    guardian2Phone: v.optional(v.string()),
    waiversAccepted: v.optional(v.array(v.string())),
    // Exact policy wording the parent saw and agreed to, kept at signing.
    waiverSnapshot: v.optional(v.array(v.object({ id: v.string(), title: v.string(), text: v.string() }))),
    // Full name typed by the parent as their signature.
    signatureName: v.optional(v.string()),
    signedAt: v.optional(v.number()),
    childAddress: v.optional(v.string()),
    childSchool: v.optional(v.string()),
    emergencyContact: v.optional(v.string()),
    authorizedPickup: v.optional(v.string()),
    customAnswers: v.optional(v.array(v.object({ question: v.string(), answer: v.string() }))),
    amountCents: v.number(),
    status: v.string(),
    // Set when a registration is moved to another session.
    transferredTo: v.optional(v.id("registrations")),
    transferredFrom: v.optional(v.id("registrations")),
    // Audit trail of staff/family changes (transfer, refund, credit).
    history: v.optional(v.array(v.object({ at: v.number(), action: v.string(), by: v.string(), detail: v.string(), amountCents: v.optional(v.number()) }))),
  })
    .index("by_user", ["userId"])
    .index("by_programId", ["programId"])
    .index("by_locationSlug", ["locationSlug"])
    .index("by_status", ["status"]),

  // Family account ledger: payments, credits, refunds, transfers (cents).
  // Positive amountCents = value to the family, negative = charge.
  ledger: defineTable({
    userId: v.string(),
    type: v.string(), // payment | refund | credit | credit_used | transfer
    description: v.string(),
    amountCents: v.number(),
    registrationId: v.optional(v.id("registrations")),
    // Staff member who executed this transaction (empty = family self-service).
    staffEmail: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_user", ["userId", "createdAt"]),

  // Refund-to-card requests, reviewed by staff before money moves.
  refundRequests: defineTable({
    userId: v.string(),
    registrationId: v.id("registrations"),
    paidCents: v.number(),
    adminFeeCents: v.number(),
    refundCents: v.number(),
    reason: v.optional(v.string()),
    status: v.string(), // pending | approved | declined
    stripeRefundId: v.optional(v.string()),
    stripeStatus: v.optional(v.string()),
    createdAt: v.number(),
    processedAt: v.optional(v.number()),
    processedBy: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_status", ["status", "createdAt"]),

  // Session waitlists. Freed spots are offered automatically, oldest first.
  // status: waiting | offered | accepted | declined | expired | cancelled
  waitlist: defineTable({
    userId: v.string(),
    programId: v.string(),
    locationSlug: v.string(),
    sessionId: v.string(),
    optionId: v.string(),
    childLocalId: v.optional(v.string()),
    childName: v.string(),
    childDob: v.string(),
    parentName: v.string(),
    parentEmail: v.string(),
    status: v.string(),
    createdAt: v.number(),
    offeredAt: v.optional(v.number()),
    offerExpiresAt: v.optional(v.number()),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_session", ["programId", "sessionId", "createdAt"])
    .index("by_user", ["userId", "createdAt"])
    .index("by_status", ["status", "createdAt"]),

  // Staff-managed program catalog. `data` is the full Program JSON
  // (sessions, pricing options, add-ons); summary fields are indexed.
  managedPrograms: defineTable({
    programId: v.string(),
    locationSlug: v.string(),
    name: v.string(),
    category: v.string(),
    season: v.string(),
    published: v.boolean(),
    archived: v.optional(v.boolean()),
    data: v.string(),
    updatedAt: v.number(),
    updatedBy: v.string(),
  })
    .index("by_programId", ["programId"])
    .index("by_location", ["locationSlug"]),

  // Super-admin site settings (single row, key = "site"). `data` is JSON.
  siteSettings: defineTable({
    key: v.string(),
    data: v.string(),
    updatedAt: v.number(),
    updatedBy: v.string(),
  }).index("by_key", ["key"]),

  // Invited staff members with portal access.
  staffMembers: defineTable({
    email: v.string(),
    name: v.optional(v.string()),
    role: v.string(), // staff
    locations: v.optional(v.array(v.string())),
    invitedBy: v.string(),
    invitedAt: v.number(),
    emailStatus: v.optional(v.string()),
    inviteToken: v.optional(v.string()),
    acceptedAt: v.optional(v.number()),
  })
    .index("by_email", ["email"])
    .index("by_token", ["inviteToken"]),

  // Staff-managed coupon / discount codes. kind: percent | amount (cents).
  coupons: defineTable({
    code: v.string(),
    kind: v.string(),
    value: v.number(),
    description: v.optional(v.string()),
    active: v.boolean(),
    expiresAt: v.optional(v.number()),
    maxUses: v.optional(v.number()),
    uses: v.number(),
    createdBy: v.string(),
    createdAt: v.number(),
  }).index("by_code", ["code"]),

  // Started-but-unpaid checkouts, for the 24h abandoned cart reminder.
  pendingCarts: defineTable({
    email: v.string(),
    stripeSessionId: v.string(),
    summary: v.string(),
    dueCents: v.number(),
    reminded: v.boolean(),
    createdAt: v.number(),
  }).index("by_reminded", ["reminded", "createdAt"]),

  // Staff activity log: who changed what in the Staff Portal.
  activityLog: defineTable({
    actor: v.string(),
    action: v.string(),
    detail: v.string(),
    createdAt: v.number(),
  }).index("by_created", ["createdAt"]),

  // Private staff-only notes on a registration (families never see these).
  staffNotes: defineTable({
    registrationId: v.optional(v.string()),
    userId: v.string(),
    note: v.string(),
    updatedBy: v.string(),
    updatedAt: v.number(),
  })
    .index("by_registration", ["registrationId"])
    .index("by_user", ["userId"]),

  // Staff program emails: a record of every send, plus scheduled sends.
  sentEmails: defineTable({
    programId: v.string(),
    programName: v.string(),
    sessionLabel: v.string(),
    subject: v.string(),
    payload: v.string(),
    status: v.string(), // scheduled | sent | failed | cancelled
    sendAt: v.number(),
    sentCount: v.optional(v.number()),
    failedCount: v.optional(v.number()),
    createdBy: v.string(),
    createdAt: v.number(),
  }).index("by_created", ["createdAt"]),

  // Co-parent / second guardian access to a family account.
  familyMembers: defineTable({
    ownerUserId: v.string(),
    ownerName: v.string(),
    email: v.string(),
    memberUserId: v.optional(v.string()),
    status: v.string(), // invited | active
    invitedAt: v.number(),
    acceptedAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerUserId"])
    .index("by_email", ["email"])
    .index("by_member", ["memberUserId"]),

  // Two-step sign-in codes for the Staff Portal (one row per staff device).
  staffVerifications: defineTable({
    email: v.string(),
    deviceId: v.string(),
    code: v.string(),
    expiresAt: v.number(),
    attempts: v.number(),
    verifiedUntil: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_email_device", ["email", "deviceId"]),

  // Staff-assigned groups within a session roster (e.g. Group A, 2016s).
  rosterGroups: defineTable({
    programId: v.string(),
    sessionId: v.string(),
    registrationId: v.string(),
    group: v.string(),
    updatedBy: v.string(),
    updatedAt: v.number(),
  }).index("by_session", ["programId", "sessionId"]),

  // Saved Email Families templates (staff-authored).
  staffEmailTemplates: defineTable({
    name: v.string(),
    subject: v.string(),
    body: v.string(),
    createdBy: v.string(),
    updatedAt: v.number(),
  }).index("by_name", ["name"]),

  couponRedemptions: defineTable({
    code: v.string(),
    userId: v.string(),
    discountCents: v.number(),
    createdAt: v.number(),
  }).index("by_code", ["code", "createdAt"]),

  // Commerce Kit tables (Shipper-managed — do not remove)
  // Commerce Kit - single-merchant product catalog
  products: defineTable({
    name: v.string(),
    // Price in minor units (e.g. cents) to avoid floating point drift.
    price: v.number(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("draft")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status", "createdAt"])
    .index("by_created", ["createdAt"]),

  // Commerce Kit - single-row store configuration
  storeSettings: defineTable({
    storeName: v.optional(v.string()),
    category: v.optional(v.string()),
    currency: v.optional(v.string()),
    paymentProvider: v.optional(v.string()),
    paymentConnected: v.optional(v.boolean()),
    // Where new-order notifications go (overrides the project owner's account email).
    notificationEmail: v.optional(v.string()),
    // Ask for a delivery address + phone at checkout (default ON; digital
    // stores can turn it off in the Store manager).
    collectShippingAddress: v.optional(v.boolean()),
    // Flat shipping fee in minor units (cents); 0/unset = free shipping.
    shippingFee: v.optional(v.number()),
    // Subtotal (minor units) at/above which shipping becomes free.
    freeShippingThreshold: v.optional(v.number()),
    // Per-location zones (label + fee in minor units). When set, the customer
    // picks their zone on Stripe's page and zones override the flat fee.
    shippingZones: v.optional(
      v.array(v.object({ label: v.string(), fee: v.number() })),
    ),
    updatedAt: v.number(),
  }),

  // Commerce Kit - checkout orders (Stripe)
  orders: defineTable({
    stripeSessionId: v.string(),
    items: v.array(
      v.object({
        productId: v.string(),
        name: v.string(),
        price: v.number(), // minor units (cents)
        quantity: v.number(),
      }),
    ),
    amountTotal: v.number(), // minor units (cents)
    currency: v.string(),
    status: v.string(), // payment status: "pending" | "paid"
    // Fulfillment status, managed by the merchant in the Store manager.
    fulfillmentStatus: v.optional(v.string()), // "unfulfilled" | "fulfilled" | "shipped"
    customerEmail: v.optional(v.string()),
    // Delivery details collected on Stripe's hosted checkout page.
    customerName: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    // Shipping actually charged on this order (minor units).
    shippingFee: v.optional(v.number()),
    // Zone the customer selected at checkout (when the store uses zones).
    shippingZone: v.optional(v.string()),
    shippingAddress: v.optional(
      v.object({
        line1: v.optional(v.string()),
        line2: v.optional(v.string()),
        city: v.optional(v.string()),
        state: v.optional(v.string()),
        postalCode: v.optional(v.string()),
        country: v.optional(v.string()),
      }),
    ),
    createdAt: v.number(),
  })
    .index("by_session", ["stripeSessionId"])
    .index("by_created", ["createdAt"]),


  // Automations (Trigger → Action workflows)

  // Automations - Trigger → Action workflows
  automations: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    enabled: v.boolean(),
    archived: v.optional(v.boolean()),

    triggerType: v.union(
      v.literal("scheduled"),
      v.literal("data_event")
    ),

    schedule: v.optional(v.object({
      type: v.union(v.literal("interval"), v.literal("cron"), v.literal("once")),
      intervalMinutes: v.optional(v.number()),
      cronExpression: v.optional(v.string()),
      runAt: v.optional(v.number()),
      timezone: v.optional(v.string()),
    })),

    dataEvent: v.optional(v.object({
      tableName: v.string(),
      event: v.union(
        v.literal("create"),
        v.literal("update"),
        v.literal("delete")
      ),
      filter: v.optional(v.string()),
    })),

    actionPath: v.string(),
    actionArgs: v.optional(v.string()),
    type: v.optional(v.union(v.literal("email"), v.literal("general"))),

    lastRunAt: v.optional(v.number()),
    lastRunStatus: v.optional(v.union(v.literal("success"), v.literal("failure"))),
    nextScheduledRunId: v.optional(v.string()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_enabled", ["enabled"])
    .index("by_trigger_type", ["triggerType", "enabled"]),

  automation_runs: defineTable({
    automationId: v.id("automations"),
    status: v.union(v.literal("running"), v.literal("success"), v.literal("failure")),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    output: v.optional(v.string()),
    triggeredBy: v.union(
      v.literal("schedule"),
      v.literal("data_event"),
      v.literal("manual")
    ),
    eventPayload: v.optional(v.string()),
  })
    .index("by_automation", ["automationId", "startedAt"])
    .index("by_status", ["status", "startedAt"]),

});
