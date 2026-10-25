"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import Storefront from "./public/storefront";
import AdminApp from "./admin/admin-app";

/** Root client shell: hash routing between the public storefront and #/admin. */
export default function SalonFlowApp() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 },
        },
      })
  );
  const [route, setRoute] = useState<"public" | "admin">("public");

  useEffect(() => {
    const sync = () => setRoute(window.location.hash.startsWith("#/admin") ? "admin" : "public");
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {route === "admin" ? <AdminApp /> : <Storefront />}
    </QueryClientProvider>
  );
}
