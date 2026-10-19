import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Header, Footer } from "@/components/site-chrome";
import { CatalogSync } from "@/components/catalog-sync";
import { CloudSync } from "@/lib/cloud-sync";

export const Route = createRootRoute({
  component: () => (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only z-[60] rounded-full bg-primary px-5 py-2.5 font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
      <CatalogSync>
        <CloudSync />
        <Header />
        <main id="main" tabIndex={-1} className="flex-1 outline-none">
          <Outlet />
        </main>
        <Footer />
      </CatalogSync>
    </div>
  ),
});
