---
name: Hosted Supabase health probes
description: The reliable public endpoint to distinguish a reachable hosted Supabase project from an unavailable local stack
---

Use `/auth/v1/settings` with the anon key as the availability probe for Supabase API contract checks. The bare `/rest/v1/` root can return HTTP 401 on hosted Supabase even when authentication and PostgREST are healthy; local stacks may return 200 instead.

**Why:** Treating the hosted root’s 401 as downtime silently skipped the contract suites that were intended to validate the hosted seeded environment.

**How to apply:** Keep the probe separate from the actual authenticated schema queries; a healthy probe should lead to test failures for bad schema exposure or permissions, not a skip.