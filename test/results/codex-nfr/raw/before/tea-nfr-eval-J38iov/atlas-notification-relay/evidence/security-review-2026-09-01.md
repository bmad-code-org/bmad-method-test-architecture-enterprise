# Security Review: Atlas Notification Relay

**Reviewer:** Platform security guild
**Date:** 2026-09-01
**Build:** `relay@2.3.0`

---

## Authentication

OAuth 2.1 authorization-code flow with PKCE. Access tokens are signed ES256 and issued with a
900-second (15-minute) lifetime; refresh tokens rotate on every use. Verified by
`relay/test/auth/token-lifetime.spec.ts` and by a manual replay of an expired token against every
relay route.

**Result:** meets the tech-spec requirement.

## Authorization

Service-scoped RBAC is enforced in `relay/src/http/service-guard.ts`, ahead of every route in the
relay router. The authorization suite exercises all seven relay routes with a token issued for a
different product service; each returns 403 and writes an audit record. Cross-service read attempts:
7 of 7 refused.

**Result:** meets the tech-spec requirement.

## Data protection

- At rest: message bodies and delivery receipts use AES-256 volume encryption; keys rotate every 90
  days through the platform key service.
- In transit: the relay's ingress terminates TLS 1.3 only, and every outbound webhook is TLS 1.2 or
  better with certificate verification on.
- Retention: the deletion job runs hourly. The 2026-09-01 audit found no message body older than
  24 hours across 1.2 million delivered messages.

**Result:** meets the tech-spec requirement.

## Secrets management

No credential literal appears in the repository. Secrets are injected as environment variables by
the deploy pipeline and the pre-commit secret scanner has reported clean since the service was
created.

## Compliance: GDPR

The relay is a processor for recipient data. The data-processing record was reviewed on 2026-08-28
and is current; the 24-hour retention control above is the technical measure it names; subject
erasure requests are served by the deletion job within one hour. The compliance team signed the
review on 2026-09-01.

**Result:** meets the tech-spec requirement.

## Dependency scanning

See `evidence/dependency-scan-2026-09-01.json` for the release scan.
