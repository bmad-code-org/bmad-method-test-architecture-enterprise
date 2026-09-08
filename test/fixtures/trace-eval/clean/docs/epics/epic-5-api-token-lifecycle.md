# Epic 5: API Token Lifecycle

**Product:** Tidewater Support Desk, a multi-tenant help desk
**Release:** 4.3.0
**Owner:** Platform Quality
**Status:** implementation complete, quality gate pending

Integrators authenticate to the Tidewater API with tenant-scoped tokens. This epic covers creating, listing, expiring, and revoking those tokens. It is the coverage oracle for the traceability run.

## Scope

- Token creation, including a name and an expiry date.
- Token listing in the console, including state and last use.
- Revocation and expiry, both of which stop a token from authenticating.

## Acceptance Criteria

Priorities are assigned from the test priorities matrix. P0 covers security, data integrity, and revenue-critical behavior. P1 covers core journeys. P2 covers secondary workflows.

### AC-1 (P0): A revoked token stops working immediately

Once a token is revoked, the next request that presents it is rejected with `401`.

### AC-2 (P0): A token secret is returned once and never again

The creation response carries the token secret. No later read of the token, single or in a list, returns the secret.

### AC-3 (P1): An admin creates a token with a name and an expiry

A tenant administrator creates a token by supplying a name and an expiry date. The new token appears in the console list showing its name and a masked prefix.

### AC-4 (P1): A token past its expiry stops working and is marked expired

A request presenting a token whose expiry has passed is rejected with `401`, and the console list shows that token in the expired state.

### AC-5 (P2): The token list shows when each token was last used

The list shows the last use time for a token that has been used, and shows `Never used` for a token that has not.

## Test Locations

Automated coverage for this epic lives under `tests/`:

- `tests/e2e/` for console journeys
- `tests/api/` for endpoint behavior
- `tests/component/` for isolated component behavior

## Recorded Live Verification

None. Every criterion in this epic is covered by a re-runnable test in the repository.
