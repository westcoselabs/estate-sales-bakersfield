"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Refresh an open dashboard when the next published sale closes. */
export function ListingStatusRefresh({
  endsAt,
}: {
  readonly endsAt: string | null;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!endsAt) return;
    let timer: ReturnType<typeof setTimeout>;
    function schedule() {
      const remaining = new Date(endsAt!).getTime() - Date.now();
      timer = setTimeout(
        () => {
          if (remaining > 2_147_483_647) schedule();
          else router.refresh();
        },
        Math.min(2_147_483_647, Math.max(100, remaining + 100)),
      );
    }
    function onVisible() {
      if (document.visibilityState === "visible") router.refresh();
    }
    schedule();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [endsAt, router]);
  return null;
}
