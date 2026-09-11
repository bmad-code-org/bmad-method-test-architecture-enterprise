# Security Review: Harbor Billing Ledger

**Reviewer:** Platform security guild
**Date:** 2026-08-29
**Build:** `ledger@4.8.2`

---

## Authentication

OAuth 2.1 authorization-code flow with PKCE. Access tokens are signed ES256 and issued with a
900-second (15-minute) lifetime; refresh tokens rotate on every use and the previous token is
revoked. Verified by `ledger/test/auth/token-lifetime.spec.ts`, which asserts the issued `exp`
claim, and by a manual replay of an expired token against every statement route.

**Result:** meets the tech-spec requirement.

## Authorization

Tenant-scoped RBAC is enforced in `ledger/src/http/tenant-guard.ts`, which runs ahead of every
route in the statements router. The authorization suite exercises all five statement routes with a
token issued for a different tenant; each returns 403 and writes an audit record. Cross-tenant read
attempts: 5 of 5 refused.

**Result:** meets the tech-spec requirement.

## Data protection

- At rest: the statements table and its backups use AES-256 volume encryption; keys rotate every 90
  days through the platform key service.
- In transit: the ledger's ingress terminates TLS 1.3 only. TLS 1.2 and below were disabled on
  2026-06-14 and the scan below confirms no downgrade path.
- Settlement references are opaque and carry no payment instrument data.

**Result:** meets the tech-spec requirement.

## Secrets management

No credential literal appears in the repository. Secrets are injected as environment variables by
the deploy pipeline and the pre-commit secret scanner has reported clean for 41 consecutive weeks.

## Compliance scope

Confirmed with the compliance team on 2026-08-26: the ledger stores no cardholder data and no
personal health data, so PCI-DSS and HIPAA do not apply to this service. No other external regime
covers it. This section exists so a reader does not have to infer the scope from silence.

## Dependency scanning

See `evidence/dependency-scan-2026-08-30.json` for the release scan.
