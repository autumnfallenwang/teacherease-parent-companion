"use client";

// Phase 25 / Q33: first-run gate. Redirects to /setup when the user
// hasn't yet acknowledged the legal disclaimer. Renders nothing visible.

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { getSettingString } from "@/lib/ipc";

const ACK_KEY = "wizard.disclaimerAcknowledgedAt";

export function DisclaimerGate() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Skip the check when we're already on /setup — otherwise we'd
    // redirect into a loop.
    if (pathname?.startsWith("/setup")) return;
    void (async () => {
      const ack = await getSettingString(ACK_KEY, "");
      if (!ack) router.replace("/setup");
    })();
  }, [pathname, router]);

  return null;
}
