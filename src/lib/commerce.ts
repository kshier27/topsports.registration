/**
 * Commerce Kit - storefront live products + cart (Shipper-managed data contract)
 *
 * SHIPPER_COMMERCE_TEMPLATE_VERSION 14
 *
 * DO NOT EDIT: this file is generated and kept in sync by Shipper. Read the live
 * catalog from these hooks and build your storefront UI on top of them. Prices
 * are returned in MAJOR units (e.g. dollars) — already divided from the stored
 * minor units (cents) — so pass them straight to your formatPrice helper.
 *
 * Empty catalog returns [] (not undefined), so keep src/data/products.ts as a
 * seed/fallback for the empty state; live products take priority when present.
 *
 * CART: use `useCart()` for all cart state — it is a single shared,
 * localStorage-persisted store, so the add-to-cart button, header badge, cart
 * page and checkout always agree. Do NOT build your own cart store (Zustand /
 * context); build the cart UI on top of this hook.
 */
import { useState, useSyncExternalStore } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export interface LiveProduct {
  id: string;
  name: string;
  /** Price in major units (e.g. dollars). */
  price: number;
  description?: string;
  category?: string;
  imageUrl?: string;
}

/** One line in the cart passed to checkout. */
export interface CheckoutItem {
  productId: string;
  quantity: number;
}

interface RawProduct {
  _id: string;
  name: string;
  price: number; // minor units (cents)
  description?: string;
  category?: string;
  imageUrl?: string;
}

function toLiveProduct(p: RawProduct): LiveProduct {
  return {
    id: p._id,
    name: p.name,
    price: p.price / 100,
    description: p.description,
    category: p.category,
    imageUrl: p.imageUrl,
  };
}

/**
 * Live, real-time list of ACTIVE products from the Shipper Cloud catalog.
 * `products` is undefined while loading and [] when the catalog is empty.
 */
export function useLiveProducts(): {
  products: LiveProduct[] | undefined;
  isLoading: boolean;
} {
  const data = useQuery(api.commerce.listActiveProducts) as
    | RawProduct[]
    | undefined;
  return {
    products: data ? data.map(toLiveProduct) : undefined,
    isLoading: data === undefined,
  };
}

/** Live single product by id (undefined while loading, null if not found). */
export function useLiveProduct(id: string): {
  product: LiveProduct | null | undefined;
  isLoading: boolean;
} {
  const { products, isLoading } = useLiveProducts();
  if (!products) return { product: undefined, isLoading };
  return { product: products.find((p) => p.id === id) ?? null, isLoading: false };
}

/**
 * One line in the managed cart. Prices are in MAJOR units (dollars) for display
 * only — checkout re-resolves prices server-side from the live catalog, so a
 * tampered price here can never affect what the customer is charged.
 */
export interface CartItem {
  productId: string;
  name: string;
  price: number;
  imageUrl?: string;
  quantity: number;
}

// A single shared cart store (module-level, not per-component) so the header
// badge, cart page and checkout always read the same state. Persisted to
// localStorage and synced across tabs. Read it through useCart().
const CART_STORAGE_KEY = "shipper_cart_v1";
const EMPTY_CART: CartItem[] = [];

function loadCart(): CartItem[] {
  if (typeof window === "undefined") return EMPTY_CART;
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return EMPTY_CART;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY_CART;
    return parsed.filter(
      (i): i is CartItem =>
        i &&
        typeof i.productId === "string" &&
        typeof i.name === "string" &&
        typeof i.price === "number" &&
        typeof i.quantity === "number",
    );
  } catch {
    return EMPTY_CART;
  }
}

let cartItems: CartItem[] = loadCart();
const cartListeners = new Set<() => void>();

function emitCart(): void {
  cartListeners.forEach((l) => l());
}

function setCart(next: CartItem[]): void {
  cartItems = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
    } catch {
      /* ignore quota/serialization errors */
    }
  }
  emitCart();
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === CART_STORAGE_KEY) {
      cartItems = loadCart();
      emitCart();
    }
  });
}

// Managed guarantee: when the shopper lands on the checkout success page — the
// full-page redirect Stripe performs after a completed payment (and the demo
// redirect before Stripe is connected) — clear the cart, so a paid order never
// leaves items behind even if the success page's own code forgets to. Runs once
// at import time on that page's fresh load.
if (typeof window !== "undefined") {
  const path = window.location.pathname;
  if (
    path.endsWith("/checkout/success") ||
    path.endsWith("/checkout/success/")
  ) {
    setCart(EMPTY_CART);
  }
}

function subscribeCart(listener: () => void): () => void {
  cartListeners.add(listener);
  return () => {
    cartListeners.delete(listener);
  };
}

export interface UseCart {
  items: CartItem[];
  /** Add a product (or increment its quantity if already in the cart). */
  addItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  removeItem: (productId: string) => void;
  /** Set an exact quantity; a quantity <= 0 removes the line. */
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  /** Total number of units across all lines (use for the header badge). */
  itemCount: number;
  /** Sum of price * quantity in major units (dollars). */
  subtotal: number;
}

/**
 * The managed shopping cart. Shared across every component that calls it, so the
 * add-to-cart button, header badge, cart page and checkout stay in sync
 * automatically. Build your cart UI on top of this — do not roll your own store.
 */
export function useCart(): UseCart {
  const items = useSyncExternalStore(
    subscribeCart,
    () => cartItems,
    () => EMPTY_CART,
  );

  const addItem = (item: Omit<CartItem, "quantity">, quantity = 1): void => {
    if (quantity <= 0) return;
    const existing = cartItems.find((i) => i.productId === item.productId);
    if (existing) {
      setCart(
        cartItems.map((i) =>
          i.productId === item.productId
            ? { ...i, ...item, quantity: i.quantity + quantity }
            : i,
        ),
      );
    } else {
      setCart([...cartItems, { ...item, quantity }]);
    }
  };

  const removeItem = (productId: string): void =>
    setCart(cartItems.filter((i) => i.productId !== productId));

  const updateQuantity = (productId: string, quantity: number): void => {
    if (quantity <= 0) {
      setCart(cartItems.filter((i) => i.productId !== productId));
      return;
    }
    setCart(
      cartItems.map((i) =>
        i.productId === productId ? { ...i, quantity } : i,
      ),
    );
  };

  const clearCart = (): void => setCart(EMPTY_CART);

  const itemCount = items.reduce((n, i) => n + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return {
    items,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    itemCount,
    subtotal,
  };
}

/**
 * Checkout with Stripe. Call `checkout()` from your cart/checkout button —
 * with no arguments it uses the managed cart (useCart); pass an explicit
 * CheckoutItem[] only if you manage items yourself. It creates a Stripe Checkout
 * Session on the server (prices resolved server-side from the live catalog) and
 * redirects the browser to Stripe.
 *
 * `checkoutReady` tells you BEFORE the click whether payments are connected
 * (live query — flips to true the moment the merchant connects Stripe, no
 * rebuild): true = checkout() will create a real Stripe session; false = the
 * store isn't accepting payments yet, so disable or relabel the Pay button
 * (e.g. "This store isn't accepting payments yet") instead of letting the
 * click fail; undefined = still loading. If checkout() is called anyway while
 * not connected, it rejects with a "Payments are not connected" error.
 *
 * `shippingFee` / `freeShippingThreshold` / `shippingZones` are the
 * merchant's REAL shipping settings in MAJOR units (e.g. dollars; undefined
 * while loading, threshold null when not set). Show these in the cart/checkout
 * summary — NEVER invent a shipping amount. When `shippingZones` is non-empty
 * the customer picks their location on Stripe's page, so show
 * "Shipping: from $X (selected at checkout)" using the cheapest zone;
 * otherwise "Shipping: $X (added at checkout)" or "Free shipping over $Y".
 * The cart is cleared on the /checkout/success page.
 */
export function useCheckout(): {
  checkout: (items?: CheckoutItem[]) => Promise<void>;
  isRedirecting: boolean;
  checkoutReady: boolean | undefined;
  shippingFee: number | undefined;
  freeShippingThreshold: number | null | undefined;
  shippingZones: Array<{ label: string; fee: number }> | undefined;
} {
  const createCheckoutSession = useAction(api.commerce.createCheckoutSession);
  const paymentsStatus = useQuery(api.commerce.paymentsStatus) as
    | {
        connected: boolean;
        shippingFee?: number;
        freeShippingThreshold?: number | null;
        shippingZones?: Array<{ label: string; fee: number }>;
      }
    | undefined;
  const [isRedirecting, setIsRedirecting] = useState(false);

  const checkout = async (explicitItems?: CheckoutItem[]) => {
    const items =
      explicitItems ??
      cartItems.map((i) => ({ productId: i.productId, quantity: i.quantity }));
    if (items.length === 0) return;
    // Stripe's hosted checkout refuses to render inside an iframe (e.g. the
    // Shipper preview). If we're framed, open a top-level tab synchronously on
    // the click — so it isn't popup-blocked — and navigate it once the session
    // URL is ready; in a normal (unframed) tab, redirect the current tab, which
    // is the standard production flow.
    const framed =
      typeof window !== "undefined" && window.self !== window.top;
    const popup = framed ? window.open("", "_blank") : null;
    setIsRedirecting(true);
    try {
      const origin = window.location.origin;
      const { url } = await createCheckoutSession({
        items: items.map((i) => ({
          productId: i.productId as Id<"products">,
          quantity: i.quantity,
        })),
        successUrl: origin + "/checkout/success?session_id={CHECKOUT_SESSION_ID}",
        cancelUrl: origin + "/cart",
      });
      if (popup) {
        popup.location.href = url;
      } else if (framed) {
        window.open(url, "_blank");
      } else {
        window.location.href = url;
      }
    } catch (err) {
      if (popup) popup.close();
      setIsRedirecting(false);
      throw err;
    }
  };

  return {
    checkout,
    isRedirecting,
    checkoutReady: paymentsStatus?.connected,
    shippingFee:
      paymentsStatus === undefined
        ? undefined
        : (paymentsStatus.shippingFee ?? 0) / 100,
    freeShippingThreshold:
      paymentsStatus === undefined
        ? undefined
        : paymentsStatus.freeShippingThreshold == null
          ? null
          : paymentsStatus.freeShippingThreshold / 100,
    shippingZones:
      paymentsStatus === undefined
        ? undefined
        : (paymentsStatus.shippingZones ?? []).map((z) => ({
            label: z.label,
            fee: z.fee / 100,
          })),
  };
}
