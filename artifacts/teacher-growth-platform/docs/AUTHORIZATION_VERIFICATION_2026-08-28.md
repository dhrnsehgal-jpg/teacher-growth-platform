# Hosted authorization verification — 28 August 2026

This record verifies the two restricted-access scenarios in
[`REPLIT_DEPLOYMENT.md`](REPLIT_DEPLOYMENT.md) against the hosted Supabase
project used by the Replit development preview.

No service-role credential was used. Every API request used the public
publishable key plus the named user's password session, so PostgREST evaluated
the hosted Row Level Security policies for that user.

## Department manager: no access to Neha Sharma's pay position

**Account:** `vikram.rao@demo-school.example`

### Browser evidence

- Sign-in succeeded.
- `/increment` rendered Vikram's own empty state:
  “Readiness has not been computed for you this year.”
- The page contained no Neha Sharma name, recommendation, outcome, readiness
  percentage, approval chain or pay decision.
- The only pay-related content was generic pay-framework information and the
  statement that the platform holds no salary figures.
- The browser received an HTML document for `/increment`; no browser-observable
  JSON response exposed Neha's recommendation.
- Browser test verdict: **passed**.

### Hosted API evidence

1. Neha's authenticated session queried `pay.recommendation` and identified one
   recommendation row, establishing that the target record exists.
2. Vikram's authenticated session queried that exact teacher's recommendation
   through PostgREST using the `pay` profile.
3. The hosted response was HTTP `200` with `0` rows.

The empty successful response is the expected PostgREST behavior when a row is
filtered out by RLS.

## Principal: no access to the school-wide audit page or trail

**Account:** `gurpreet.dhillon@demo-school.example`

### Browser evidence

- Sign-in succeeded.
- `/admin/audit` rendered:
  “You do not have permission to read the audit log.”
- No audit filters, entry count, table, actor names, actions or audit records
  were rendered.
- The browser received an HTML response containing the refusal branch; no
  browser-observable response exposed audit records.
- Browser test verdict: **passed**.

### Hosted API evidence

1. `core.has_permission(school_id, 'audit.read')`, called with Gurpreet's
   authenticated session, returned HTTP `200` and `false`.
2. A compliance administrator's authenticated session identified an existing
   school-scoped, third-party row in `audit.audit_log`.
3. Gurpreet's authenticated session queried that exact row through PostgREST
   using the `audit` profile.
4. The hosted response was HTTP `200` with `0` rows.

The audit table intentionally has narrower RLS exceptions for a person's own
record and global regulatory history. Those exceptions do not grant
`audit.read`, do not expose the school-wide audit page, and did not expose the
third-party witness row.

## Result

Both deployment-guide authorization checks passed. Hosted RLS prevented the
department manager from reading Neha Sharma's pay recommendation and prevented
the principal from reading a known third-party school audit record; the
application's permission gate also refused the principal's audit page.