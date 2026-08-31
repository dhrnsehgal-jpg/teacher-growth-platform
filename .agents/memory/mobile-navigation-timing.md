---
name: Mobile navigation timing
description: Timing considerations for mobile Playwright route sweeps in this app
---

Mobile navigation smoke tests should keep explicit URL and heading assertions while allowing a bounded render window for each destination and for the full sweep.

**Why:** SSR-heavy, permission-filtered pages can take longer than Playwright's default five-second expectation in the proxied preview, even when the server responds successfully.

**How to apply:** Preserve click-through navigation from the primary nav, but use a finite per-route timeout and enough overall test time for every destination. Do not replace the navigation check with direct `goto` calls.