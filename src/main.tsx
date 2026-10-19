import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import './index.css'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Import the generated route tree
import { routeTree } from './routeTree.gen'
import { ConvexReactClient } from "convex/react";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { authClient } from "./lib/auth-client";
const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

// Create a new router instance
const router = createRouter({ routeTree })

const queryClient = new QueryClient()

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Render the app
const rootElement = document.getElementById('root')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <ConvexBetterAuthProvider client={convex} authClient={authClient}>
      <StrictMode>
      <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="top-ui-theme-light">
        <RouterProvider router={router} />
        <Toaster offset={{ bottom: 96 }} mobileOffset={{ bottom: 96 }} />
      </ThemeProvider>
      </QueryClientProvider>
    </StrictMode>
    </ConvexBetterAuthProvider>
  )
}