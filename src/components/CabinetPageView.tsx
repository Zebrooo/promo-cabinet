"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackEvent } from "@/lib/analytics";

/** Fires a cabinet_page_view event every time the pathname changes. */
export function CabinetPageView() {
  const pathname = usePathname();
  useEffect(() => {
    trackEvent("cabinet_page_view", { page: pathname });
  }, [pathname]);
  return null;
}
