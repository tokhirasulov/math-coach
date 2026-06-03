"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect } from "react";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (posthog.__loaded) return; // prevent double-init on HMR

    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
    if (!key) return;

    posthog.init(key, {
      api_host: host ?? "https://us.i.posthog.com",
      // Autocapture pageviews (visits over time) and pageleave (session duration)
      capture_pageview: true,
      capture_pageleave: true,
      // Anonymous persistent ID — no names/emails collected
      person_profiles: "always",
      // Session replay with all inputs masked (students may be minors)
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: "textarea, input",
      },
    });
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
