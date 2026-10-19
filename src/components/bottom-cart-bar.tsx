import { Link } from "@tanstack/react-router";
import { useCart } from "@/lib/commerce";
import { formatPrice } from "@/data/registration";

/** Fixed bottom cart preview, shown once anything is in the cart. */
export function BottomCartBar() {
  const { items, itemCount, subtotal } = useCart();
  if (itemCount === 0) return null;
  const last = items[items.length - 1];
  return (
    <>
      <div className="h-28" aria-hidden />
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card shadow-[0_-8px_24px_rgba(0,0,0,0.08)] pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="min-w-0">
            <p className="text-sm font-bold">Cart · {itemCount} registration{itemCount > 1 ? "s" : ""} · {formatPrice(subtotal)}</p>
            {last && <p className="truncate text-xs text-muted-foreground">Latest: {last.name}</p>}
          </div>
          <Link to="/cart" className="inline-flex h-11 shrink-0 items-center rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground shadow-md transition-all hover:scale-[1.02] active:scale-95">View Cart</Link>
        </div>
      </div>
    </>
  );
}
