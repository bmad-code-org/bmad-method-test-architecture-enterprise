# Tech Spec: Harbor Billing Ledger

**Service:** `harbor-billing-ledger`
**Status:** Implemented, awaiting release review
**Last updated:** 2026-08-27

---

## 1. Scope

The ledger records every billable event a Harbor tenant generates and serves month-end statements
through the `/v2/tenants/{tenant}/statements` API. It owns no cardholder data: payment instruments
live in the payments service and the ledger stores only an opaque settlement reference.

---

## 2. Non-Functional Requirements

### 2.1 Security

- **Authentication.** Every ledger API call presents an OAuth 2.1 access token whose lifetime is
  15 minutes or less. Refresh tokens rotate on use.
- **Authorization.** Tenant-scoped RBAC is enforced on every statement endpoint. A token issued for
  one tenant must never read another tenant's statements.
- **Data protection.** Statements are encrypted at rest with AES-256 and in transit with TLS 1.3.
- **Vulnerability management.** A release ships with 0 critical and 0 high severity dependency
  findings. Moderate and low findings are tracked but do not block.
- **Compliance.** The ledger processes no cardholder data and no personal health data, so PCI-DSS
  and HIPAA are out of scope for this service. No external compliance regime applies to it.

### 2.2 Performance

Month-end statement generation should feel responsive to the operators who run it, and the team
watches the dashboards during the close window. Product has not yet agreed a response-time,
throughput, or resource-usage target for the ledger, and this section is the place such a target
would be recorded once it exists.

### 2.3 Reliability

- **Availability.** Monthly uptime at or above 99.5%.
- **Error rate.** The monthly 5xx rate stays below 0.5% of ledger API requests.
- **MTTR.** A ledger incident is restored within 15 minutes.
- **Fault tolerance.** The statement worker retries a failed ledger write three times with
  exponential backoff, and the region failover drill runs once a quarter.
- **CI burn-in.** 100 consecutive green runs of the ledger suite precede a release.
- **Disaster recovery.** RTO 4 hours, RPO 15 minutes.

### 2.4 Maintainability

- **Test coverage.** Statement coverage of the ledger service stays at or above 80%.
- **Structured logging.** Every ledger log line is JSON and carries `tenant_id`, `trace_id`, and
  `event_type`.
- **Error tracking.** Unhandled rejections and 5xx responses reach the error tracker.

Code duplication is reviewed by hand during pull request review. The team has not agreed a
duplication ceiling and does not run a duplication report in CI.

---

## 3. Engineering Notes

The ledger service is well covered by unit and integration tests, and the team has kept it that way
since the 2026 rewrite. Reviewers are asked to treat a pull request that lowers coverage as a
blocking comment.

The month-end close window is the only period the ledger runs hot. Everything outside it is a
fraction of the load, which is why the close window is the one the team instruments.
