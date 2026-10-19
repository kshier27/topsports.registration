/**
 * Commerce Kit - product catalog + payments API (Shipper-managed data contract)
 *
 * DO NOT EDIT: this file is generated and kept in sync by Shipper. Customizing
 * it will be overwritten and may break the Store Manager. Build your storefront
 * UI on top of these functions instead of changing them.
 *
 * SHIPPER_COMMERCE_TEMPLATE_VERSION 14
 *
 * Storefront:    api.commerce.listActiveProducts  (active products only)
 *                api.commerce.createCheckoutSession (cart -> Stripe checkout)
 * Store Manager: listProducts / createProduct / updateProduct / deleteProduct
 *                getStoreSettings / updateStoreSettings / listOrders / updateOrderFulfillment
 * Webhook:       stripeWebhook (registered in convex/http.ts) — records payment and
 *                notifies the store owner once per paid order.
 *
 * Payments are DORMANT until the merchant connects Stripe (STRIPE_SECRET_KEY set
 * on this deployment via the Shipper Store manager). No platform fee — funds go
 * to the merchant's own Stripe account.
 */
import { action, httpAction, query } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import Stripe from "stripe";

const STATUS = v.union(v.literal("active"), v.literal("draft"));
const FULFILLMENT = v.union(
  v.literal("unfulfilled"),
  v.literal("fulfilled"),
  v.literal("shipped"),
);

/**
 * Countries offered on Stripe's shipping-address form (Stripe requires an
 * explicit list). Broad coverage: Americas, Europe, Africa, Middle East, Asia
 * Pacific.
 */
const SHIPPING_COUNTRIES: Stripe.Checkout.SessionCreateParams.ShippingAddressCollection["allowed_countries"] =
  [
    "US", "CA", "MX", "BR", "AR", "CL", "CO",
    "GB", "IE", "FR", "DE", "NL", "BE", "LU", "ES", "PT", "IT", "AT", "CH",
    "SE", "NO", "DK", "FI", "PL", "CZ", "RO", "GR", "HU",
    "NG", "GH", "KE", "ZA", "EG", "MA",
    "AE", "SA", "IL", "TR",
    "IN", "PK", "SG", "MY", "TH", "PH", "VN", "ID", "JP", "KR", "HK", "TW",
    "AU", "NZ",
  ];

/** Shape of Stripe's shipping form result (structural — see webhook capture). */
type ShippingDetails = {
  name?: string | null;
  address?: {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
  } | null;
};

/**
 * Stripe client bound to the merchant's key (fetch-based for the Convex runtime).
 * Throws ConvexError so the storefront receives the REAL message (a plain Error
 * reaches the browser as an opaque "Server Error").
 */
function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new ConvexError(
      "Payments are not connected. Connect Stripe from the Shipper Store manager.",
    );
  }
  return new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
}

// Store-Manager-only functions below are internalQuery / internalMutation: the
// storefront (which embeds the deployment URL) can't reach them, while Shipper's
// server calls them with the deployment's admin deploy key. Only the storefront
// data path stays public (listActiveProducts, createCheckoutSession,
// paymentsStatus), and it exposes no PII.

/** Storefront-facing: active products only, newest first. */
export const listActiveProducts = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("products")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .order("desc")
      .collect();
  },
});

/** Store Manager: all products, optionally filtered by status. */
export const listProducts = internalQuery({
  args: {
    status: v.optional(STATUS),
    // Cursor pagination for the Store manager. Optional so callers deployed
    // against older contracts keep working (omitted = full collect).
    paginationOpts: v.optional(paginationOptsValidator),
  },
  handler: async (ctx, args) => {
    // Capture into a const so the narrowing survives inside the index callback
    // (TypeScript drops narrowing of a mutable param ref inside a closure).
    const status = args.status;
    const ordered = status
      ? ctx.db
          .query("products")
          .withIndex("by_status", (q) => q.eq("status", status))
          .order("desc")
      : ctx.db.query("products").withIndex("by_created").order("desc");
    if (args.paginationOpts) {
      return await ordered.paginate(args.paginationOpts);
    }
    return await ordered.collect();
  },
});

export const createProduct = internalMutation({
  args: {
    name: v.string(),
    price: v.number(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    status: v.optional(STATUS),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("products", {
      name: args.name,
      price: args.price,
      description: args.description,
      category: args.category,
      imageUrl: args.imageUrl,
      status: args.status ?? "draft",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateProduct = internalMutation({
  args: {
    id: v.id("products"),
    name: v.optional(v.string()),
    price: v.optional(v.number()),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    status: v.optional(STATUS),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Product not found");
    await ctx.db.patch(id, { ...updates, updatedAt: Date.now() });
    return id;
  },
});

export const deleteProduct = internalMutation({
  args: { id: v.id("products") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Product not found");
    await ctx.db.delete(args.id);
    return args.id;
  },
});

/**
 * Store Manager + checkout/webhook: single-row store settings (may hold owner
 * PII). Internal — reachable by the Store manager via the admin deploy key and
 * by the checkout action / webhook via internal.commerce.getStoreSettings.
 */
export const getStoreSettings = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("storeSettings").first();
  },
});

/**
 * Storefront-facing: can checkout create a real Stripe session right now?
 * Real-time, so the Pay button flips on the moment the merchant connects
 * Stripe — no rebuild, no refresh.
 */
export const paymentsStatus = query({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db.query("storeSettings").first();
    return {
      connected: settings?.paymentConnected === true,
      // Minor units; the storefront hook converts to major for display.
      shippingFee: settings?.shippingFee ?? 0,
      freeShippingThreshold: settings?.freeShippingThreshold ?? null,
      shippingZones: settings?.shippingZones ?? [],
    };
  },
});

export const updateStoreSettings = internalMutation({
  args: {
    storeName: v.optional(v.string()),
    category: v.optional(v.string()),
    currency: v.optional(v.string()),
    paymentProvider: v.optional(v.string()),
    paymentConnected: v.optional(v.boolean()),
    notificationEmail: v.optional(v.string()),
    collectShippingAddress: v.optional(v.boolean()),
    shippingFee: v.optional(v.number()),
    freeShippingThreshold: v.optional(v.number()),
    shippingZones: v.optional(
      v.array(v.object({ label: v.string(), fee: v.number() })),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db.query("storeSettings").first();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("storeSettings", { ...args, updatedAt: now });
  },
});

// ── Payments (Stripe) ────────────────────────────────────────────────────────

/** Internal: fetch products by id for the checkout action (server price source). */
export const productsByIds = internalQuery({
  args: { ids: v.array(v.id("products")) },
  // Explicit return type: createCheckoutSession calls this via
  // ctx.runQuery(internal.commerce.productsByIds) in this same file, and the
  // commerce.ts -> _generated/api -> commerce.ts cycle makes TypeScript
  // collapse an INFERRED return type to `never` — poisoning every product
  // access in the checkout action (10 tsc errors from this one function).
  handler: async (ctx, args): Promise<Array<Doc<"products">>> => {
    const out: Array<Doc<"products">> = [];
    for (const id of args.ids) {
      const p = await ctx.db.get(id);
      if (p) out.push(p);
    }
    return out;
  },
});

/**
 * Storefront-facing: turn a cart into a Stripe Checkout Session.
 * Prices are re-read from the DB (never trusted from the client). Draft/deleted
 * products are dropped. Records a pending order; the webhook marks it paid.
 */
export const createCheckoutSession = action({
  args: {
    items: v.array(
      v.object({ productId: v.id("products"), quantity: v.number() }),
    ),
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (ctx, args): Promise<{ url: string }> => {
    if (args.items.length === 0) throw new ConvexError("Your cart is empty.");
    const stripe = stripeClient();

    const settings = await ctx.runQuery(
      internal.commerce.getStoreSettings,
      {},
    );
    const currency = (settings?.currency ?? "usd").toLowerCase();

    const products = await ctx.runQuery(internal.commerce.productsByIds, {
      ids: args.items.map((i) => i.productId),
    });
    const byId = new Map(products.map((p) => [p._id, p]));

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    const orderItems: Array<{
      productId: string;
      name: string;
      price: number;
      quantity: number;
    }> = [];
    for (const item of args.items) {
      const product = byId.get(item.productId);
      if (!product || product.status !== "active") continue;
      const quantity = Math.max(1, Math.floor(item.quantity));
      lineItems.push({
        price_data: {
          currency,
          product_data: {
            name: product.name,
            ...(product.imageUrl ? { images: [product.imageUrl] } : {}),
          },
          unit_amount: product.price, // already minor units (cents)
        },
        quantity,
      });
      orderItems.push({
        productId: product._id,
        name: product.name,
        price: product.price,
        quantity,
      });
    }
    if (lineItems.length === 0) {
      throw new ConvexError("None of the items in your cart are available.");
    }

    // Ask Stripe's hosted page for a delivery address + phone unless the
    // merchant turned it off (digital stores). Default ON so physical stores
    // know where to ship out of the box.
    const collectShipping = settings?.collectShippingAddress !== false;

    // Merchant-set shipping, applied as REAL Stripe shipping rates so the
    // hosted page and amount_total are honest — storefronts must never invent
    // a fee. Precedence: free-shipping threshold > zones (customer picks their
    // location on Stripe's page) > flat fee. Stripe allows at most 5 options.
    const subtotal = orderItems.reduce(
      (sum, i) => sum + i.price * i.quantity,
      0,
    );
    const configuredFee = Math.max(0, Math.round(settings?.shippingFee ?? 0));
    const zones = (settings?.shippingZones ?? []).slice(0, 5);
    const threshold = settings?.freeShippingThreshold;
    const qualifiesForFree =
      typeof threshold === "number" && threshold > 0 && subtotal >= threshold;

    const fixedRate = (
      displayName: string,
      amount: number,
    ): Stripe.Checkout.SessionCreateParams.ShippingOption => ({
      shipping_rate_data: {
        display_name: displayName,
        type: "fixed_amount",
        fixed_amount: { amount, currency },
      },
    });

    let shippingOptions: Stripe.Checkout.SessionCreateParams.ShippingOption[] =
      [];
    // Known up-front only when there's a single option; with zones the fee is
    // whatever the customer picks — the webhook records the charged truth.
    let pendingShippingFee: number | undefined;
    if (collectShipping) {
      if (qualifiesForFree && (zones.length > 0 || configuredFee > 0)) {
        shippingOptions = [fixedRate("Free shipping", 0)];
        pendingShippingFee = 0;
      } else if (zones.length > 0) {
        shippingOptions = zones.map((z) =>
          fixedRate(z.label, Math.max(0, Math.round(z.fee))),
        );
      } else if (configuredFee > 0) {
        shippingOptions = [fixedRate("Standard shipping", configuredFee)];
        pendingShippingFee = configuredFee;
      }
    }

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: lineItems,
        success_url: args.successUrl,
        cancel_url: args.cancelUrl,
        ...(collectShipping
          ? {
              shipping_address_collection: {
                allowed_countries: SHIPPING_COUNTRIES,
              },
              phone_number_collection: { enabled: true },
            }
          : {}),
        ...(shippingOptions.length > 0
          ? { shipping_options: shippingOptions }
          : {}),
      });
    } catch (err) {
      // Surface the real Stripe failure (e.g. a restricted key missing
      // "Checkout Sessions: Write") instead of an opaque Server Error.
      throw new ConvexError(
        err instanceof Error
          ? "Stripe rejected the checkout: " + err.message
          : "Stripe rejected the checkout.",
      );
    }

    await ctx.runMutation(internal.commerce.recordOrder, {
      stripeSessionId: session.id,
      items: orderItems,
      amountTotal: session.amount_total ?? subtotal + (pendingShippingFee ?? 0),
      currency,
      status: "pending",
      ...(pendingShippingFee !== undefined
        ? { shippingFee: pendingShippingFee }
        : {}),
    });

    if (!session.url) {
      throw new ConvexError("Stripe did not return a checkout URL.");
    }
    return { url: session.url };
  },
});

/**
 * Internal: idempotent upsert of an order keyed by Stripe session id. Returns
 * the stored order plus `newlyPaid` — true only on the transition into "paid" —
 * so the webhook fires the owner notification exactly once despite Stripe's
 * at-least-once delivery.
 */
export const recordOrder = internalMutation({
  args: {
    stripeSessionId: v.string(),
    items: v.optional(
      v.array(
        v.object({
          productId: v.string(),
          name: v.string(),
          price: v.number(),
          quantity: v.number(),
        }),
      ),
    ),
    amountTotal: v.optional(v.number()),
    currency: v.optional(v.string()),
    status: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    customerName: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    shippingFee: v.optional(v.number()),
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
    // When set, NEVER insert: only update an order this store already created.
    // The webhook uses this — Stripe fans checkout events out to every store
    // sharing the Stripe account, and foreign sessions must not become orders.
    requireExisting: v.optional(v.boolean()),
  },
  // Explicit return type: stripeWebhook (same module) consumes this result, so
  // the annotation breaks the circular type inference through internal.commerce
  // — same pattern as createCheckoutSession above.
  handler: async (
    ctx,
    args,
  ): Promise<{
    id: Id<"orders"> | null;
    newlyPaid: boolean;
    order: Doc<"orders"> | null;
  }> => {
    const existing = await ctx.db
      .query("orders")
      .withIndex("by_session", (q) =>
        q.eq("stripeSessionId", args.stripeSessionId),
      )
      .first();
    if (existing) {
      const newlyPaid = existing.status !== "paid" && args.status === "paid";
      const { stripeSessionId, requireExisting, ...updates } = args;
      await ctx.db.patch(existing._id, updates);
      const order = await ctx.db.get(existing._id);
      return { id: existing._id, newlyPaid, order };
    }
    if (args.requireExisting) {
      return { id: null, newlyPaid: false, order: null };
    }
    const id = await ctx.db.insert("orders", {
      stripeSessionId: args.stripeSessionId,
      items: args.items ?? [],
      amountTotal: args.amountTotal ?? 0,
      currency: args.currency ?? "usd",
      status: args.status ?? "pending",
      fulfillmentStatus: "unfulfilled",
      customerEmail: args.customerEmail,
      customerName: args.customerName,
      customerPhone: args.customerPhone,
      shippingFee: args.shippingFee,
      shippingZone: args.shippingZone,
      shippingAddress: args.shippingAddress,
      createdAt: Date.now(),
    });
    const order = await ctx.db.get(id);
    return { id, newlyPaid: args.status === "paid", order };
  },
});

/** Store Manager: all orders, newest first. */
export const listOrders = internalQuery({
  args: {
    // Cursor pagination for the Store manager. Optional so callers deployed
    // against older contracts keep working (omitted = full collect).
    paginationOpts: v.optional(paginationOptsValidator),
  },
  handler: async (ctx, args) => {
    const ordered = ctx.db.query("orders").withIndex("by_created").order("desc");
    if (args.paginationOpts) {
      return await ordered.paginate(args.paginationOpts);
    }
    return await ordered.collect();
  },
});

/**
 * Email-proxy-facing: resolve ONE order's customer email by Stripe session id
 * (by_session index). Deliberately minimal — exposes nothing but the email, so
 * the order-confirmation carve-out never needs the whole orders table.
 */
export const orderEmailBySession = internalQuery({
  args: { stripeSessionId: v.string() },
  handler: async (ctx, args) => {
    const order = await ctx.db
      .query("orders")
      .withIndex("by_session", (q) =>
        q.eq("stripeSessionId", args.stripeSessionId),
      )
      .first();
    return order ? { customerEmail: order.customerEmail ?? null } : null;
  },
});

/** Store Manager: set an order's fulfillment status (unfulfilled/fulfilled/shipped). */
export const updateOrderFulfillment = internalMutation({
  args: {
    id: v.id("orders"),
    fulfillmentStatus: FULFILLMENT,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Order not found");
    await ctx.db.patch(args.id, { fulfillmentStatus: args.fulfillmentStatus });
    return args.id;
  },
});

type PaidOrderEmailInfo = {
  stripeSessionId: string;
  amountTotal: number;
  currency: string;
  customerEmail?: string;
  items: Array<{ name: string; quantity: number }>;
};

function orderEmailData(order: PaidOrderEmailInfo, storeName?: string) {
  return {
    storeName: storeName ?? "your store",
    total: `${(order.amountTotal / 100).toFixed(2)} ${order.currency.toUpperCase()}`,
    items:
      order.items.map((i) => `${i.quantity}× ${i.name}`).join(", ") ||
      "your products",
    customerEmail: order.customerEmail ?? "a customer",
  };
}

/**
 * Send one order email via the Shipper email proxy. Best-effort by contract:
 * never throws (a mail hiccup must not fail the webhook — Stripe would retry
 * and double-send), and every skip/failure reason lands in the Convex
 * dashboard logs under the [commerce] tag.
 */
async function sendOrderEmail(
  label: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const url = process.env.SHIPPER_EMAIL_URL;
  const token = process.env.SHIPPER_EMAIL_TOKEN;
  if (!url || !token) {
    // Visible in the Convex dashboard logs — answers "why did no email fire?"
    console.log(
      `[commerce] ${label} skipped: email proxy not configured (SHIPPER_EMAIL_URL/TOKEN unset)`,
    );
    return;
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shipper-Token": token },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      console.warn(
        `[commerce] ${label} failed:`,
        response.status,
        await response.text().catch(() => ""),
      );
    }
  } catch (err) {
    console.warn(`[commerce] ${label} failed:`, err);
  }
}

/**
 * Notify the store owner of a paid order. The proxy resolves the owner's
 * address server-side (notifyOwner mode), so no recipient is passed from here.
 */
function notifyOwnerOfOrder(
  order: PaidOrderEmailInfo,
  storeName: string | undefined,
): Promise<void> {
  return sendOrderEmail("owner notification", {
    notifyOwner: true,
    templateSlug: "order-notification",
    templateData: orderEmailData(order, storeName),
  });
}

/**
 * Send the customer their order confirmation. The proxy re-resolves the
 * destination server-side from the order record (orderCustomer mode + session
 * id), so the address can't be spoofed by the caller.
 */
function notifyCustomerOfOrder(
  order: PaidOrderEmailInfo,
  storeName: string | undefined,
): Promise<void> {
  if (!order.customerEmail) {
    console.log(
      "[commerce] customer confirmation skipped: order has no customer email",
    );
    return Promise.resolve();
  }
  return sendOrderEmail("customer confirmation", {
    orderCustomer: true,
    stripeSessionId: order.stripeSessionId,
    templateSlug: "order-confirmation",
    templateData: orderEmailData(order, storeName),
  });
}

/**
 * Stripe webhook (registered at POST /commerce/stripe/webhook in convex/http.ts).
 * Verifies the signature with STRIPE_WEBHOOK_SECRET (Web Crypto), then marks the
 * matching order paid. Returns 200 without processing when unconfigured so
 * Stripe stops retrying.
 */
export const stripeWebhook = httpAction(async (ctx, request) => {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const body = await request.text();
  if (!signature || !webhookSecret) {
    console.log(
      "[commerce] stripe webhook skipped: payments not connected (no signature/secret)",
    );
    return new Response(JSON.stringify({ received: true, skipped: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  let event: Stripe.Event;
  try {
    const stripe = stripeClient();
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch (err) {
    // A stale STRIPE_WEBHOOK_SECRET (e.g. endpoint recreated) lands here —
    // make the cause visible in the Convex dashboard logs.
    console.warn("[commerce] stripe webhook signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    // Delivery details from Stripe's hosted page. Newer API versions put the
    // shipping form result under collected_information; older ones exposed
    // shipping_details on the session — read both structurally so the capture
    // survives either Stripe typings version.
    const shipping = (
      session as unknown as {
        collected_information?: { shipping_details?: ShippingDetails | null };
        shipping_details?: ShippingDetails | null;
        shipping_cost?: {
          amount_total?: number | null;
          shipping_rate?: string | { id?: string } | null;
        } | null;
      }
    );
    const shippingDetails =
      shipping.collected_information?.shipping_details ??
      shipping.shipping_details ??
      undefined;
    const addr = shippingDetails?.address;
    const chargedShipping = shipping.shipping_cost?.amount_total;

    // Which delivery option the customer picked (zone label). Best-effort:
    // the session only carries the rate id, so resolve its display name.
    let shippingZone: string | undefined;
    const rawRate = shipping.shipping_cost?.shipping_rate;
    const rateId = typeof rawRate === "string" ? rawRate : rawRate?.id;
    if (rateId) {
      try {
        const rate = await stripeClient().shippingRates.retrieve(rateId);
        shippingZone = rate.display_name ?? undefined;
      } catch (err) {
        console.warn("[commerce] could not resolve shipping option name:", err);
      }
    }
    const { id, newlyPaid, order } = await ctx.runMutation(
      internal.commerce.recordOrder,
      {
        stripeSessionId: session.id,
        amountTotal: session.amount_total ?? undefined,
        currency: session.currency ?? undefined,
        customerEmail: session.customer_details?.email ?? undefined,
        customerName:
          shippingDetails?.name ?? session.customer_details?.name ?? undefined,
        customerPhone: session.customer_details?.phone ?? undefined,
        shippingFee: typeof chargedShipping === "number" ? chargedShipping : undefined,
        shippingZone,
        shippingAddress: addr
          ? {
              line1: addr.line1 ?? undefined,
              line2: addr.line2 ?? undefined,
              city: addr.city ?? undefined,
              state: addr.state ?? undefined,
              postalCode: addr.postal_code ?? undefined,
              country: addr.country ?? undefined,
            }
          : undefined,
        status: "paid",
        // Only update an order THIS store created (createCheckoutSession always
        // records a pending one). Stripe fans account-wide events out to every
        // store sharing the Stripe account — foreign sessions must not become
        // ghost orders or trigger notifications here.
        requireExisting: true,
      },
    );
    if (id === null) {
      console.log(
        "[commerce] webhook ignored: session was not created by this store (Stripe account shared with other stores)",
      );
    } else if (newlyPaid && order) {
      // Exactly once, on the transition into paid: notify the owner AND send
      // the customer their confirmation. Both best-effort.
      const settings = await ctx.runQuery(
      internal.commerce.getStoreSettings,
      {},
    );
      await notifyOwnerOfOrder(order, settings?.storeName);
      await notifyCustomerOfOrder(order, settings?.storeName);
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
