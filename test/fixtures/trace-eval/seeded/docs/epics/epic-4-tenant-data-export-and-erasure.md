# Epic 4: Tenant Data Export and Erasure

**Product:** Tidewater Support Desk, a multi-tenant help desk
**Release:** 4.3.0
**Owner:** Platform Quality
**Status:** implementation complete, quality gate pending

Tenant administrators must be able to take a tenant's data out of Tidewater and to have a tenant erased on request. The API and the console screens are implemented and merged. This epic is the coverage oracle for the traceability run.

## Scope

- Export: a tenant administrator requests an archive of the tenant's records and downloads it from a signed link.
- Erasure: a tenant administrator erases a tenant, which is irreversible.
- Both actions are written to the admin audit log.

## Acceptance Criteria

Priorities are assigned from the test priorities matrix. P0 covers security, data integrity, and revenue-critical behavior. P1 covers core journeys. P2 covers secondary workflows. P3 covers polish.

### AC-1 (P0): An admin export request returns a signed download link

A tenant administrator who requests a full export receives a job that reaches the `ready` state and exposes a signed download URL.

### AC-2 (P0): Export is denied to a member without the admin role

A member of the tenant who does not hold the admin role receives `403` from the export endpoint, and no export job is created for that request.

### AC-3 (P1): The export manifest lists contacts, invoices, and audit entries

The manifest of a completed export names exactly three sections, `contacts`, `invoices`, and `audit-entries`, and each section reports the number of records it contains.

### AC-4 (P1): Erasure requires the tenant slug to be typed exactly

The erasure dialog keeps its confirm control disabled until the typed text matches the tenant slug character for character. A near miss leaves the control disabled.

### AC-5 (P1): A queued export can be cancelled before it starts

An export job that is still queued can be cancelled. A cancelled job reaches the `cancelled` state and never exposes a download URL.

### AC-6 (P1): A download link expires 24 hours after it is issued

A signed download URL returns `410` once more than 24 hours have passed since the job reached the `ready` state.

### AC-7 (P1): Erasure is irreversible

After an erasure completes, a new export request for the same tenant returns `404`.

### AC-8 (P2): The audit log records the actor and the time of every export request

Each export request adds an audit entry that names the user who made the request and records the time at which it was made.

### AC-9 (P2): Export progress reaches 100 percent before the download becomes available

While an export runs, the console shows a progress percentage. The download control becomes available only after the percentage reaches 100.

### AC-10 (P3): The archive filename carries the tenant slug and the request date

The downloaded archive is named with the tenant slug followed by the ISO date on which the export was requested.

## Test Locations

Automated coverage for this epic lives under `tests/`:

- `tests/e2e/` for console journeys
- `tests/api/` for endpoint behavior
- `tests/unit/` for pure functions

## Recorded Live Verification

A release engineer recorded one manual verification pass for this epic. The results file is `test-artifacts/live-verification-results.json` and follows the live verification results contract.

## Gate Waivers

Two waiver requests have been filed against this epic's quality gate. Both are recorded in `test-artifacts/gate-waivers.md`.
