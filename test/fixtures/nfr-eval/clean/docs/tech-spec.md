# Tech Spec: Atlas Notification Relay

**Service:** `atlas-notification-relay`
**Status:** Implemented, awaiting release review
**Last updated:** 2026-08-31

---

## 1. Scope

The relay accepts notification requests from Atlas product services and delivers them to email, SMS,
and webhook transports. It stores a message body for at most 24 hours and then discards it, keeping
only a delivery receipt.

---

## 2. Non-Functional Requirements

### 2.1 Performance

- **Response time.** The enqueue API answers in under 300 ms at p95 under the release load profile.
- **Throughput.** The relay sustains at least 250 requests per second.
- **CPU usage.** Peak CPU stays below 70% during the load profile.
- **Memory usage.** Peak heap stays below 75% during the load profile.

### 2.2 Security

- **Authentication.** Every relay API call presents an OAuth 2.1 access token whose lifetime is
  15 minutes or less. Refresh tokens rotate on use.
- **Authorization.** Service-scoped RBAC is enforced on every relay endpoint. A token issued for one
  product service must never read another service's delivery receipts.
- **Data protection.** Message bodies are encrypted at rest with AES-256 and in transit with
  TLS 1.3, and are deleted 24 hours after delivery.
- **Vulnerability management.** A release ships with 0 critical and 0 high severity dependency
  findings.
- **Compliance.** GDPR applies: the relay is a processor for the recipient data Atlas product
  services send it, and the data-processing record and the 24-hour retention control are the
  evidence for it.

### 2.3 Reliability

- **Availability.** Monthly uptime at or above 99.9%.
- **Error rate.** The monthly 5xx rate stays below 0.5% of relay API requests.
- **MTTR.** A relay incident is restored within 15 minutes.
- **Fault tolerance.** The delivery worker opens a circuit breaker after five consecutive transport
  failures, and the region failover drill runs once a quarter.
- **CI burn-in.** 100 consecutive green runs of the relay suite precede a release.
- **Disaster recovery.** RTO 4 hours, RPO 15 minutes.

### 2.4 Maintainability

- **Test coverage.** Statement coverage of the relay service stays at or above 80%.
- **Code duplication.** Duplicated blocks stay below 5% of the relay source.
- **Dependency vulnerabilities.** 0 critical and 0 high severity findings, matching the security
  requirement above.
- **Structured logging.** Every relay log line is JSON and carries `service_id`, `trace_id`, and
  `transport`.
- **Error tracking.** Unhandled rejections and 5xx responses reach the error tracker.

---

## 3. Engineering Notes

Every threshold above was agreed with product and platform on 2026-08-24 and is measured by a job in
the release pipeline. The evidence each job produces is listed in `evidence/` beside this file.
