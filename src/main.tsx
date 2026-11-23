import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/space-grotesk";
import "./index.css";
import "./app/i18n";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";

// End-to-end tests run the UI in a browser against an in-memory backend.
if (import.meta.env.MODE === "e2e") {
  const { install } = await import("./test/e2e/mockBackend");
  install();
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 5_000 } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
