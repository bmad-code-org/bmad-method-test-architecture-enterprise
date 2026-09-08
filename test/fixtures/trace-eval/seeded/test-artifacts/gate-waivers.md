# Gate Waiver Register: Epic 4, Tenant Data Export and Erasure

Two waiver requests have been filed against the release 4.3.0 quality gate for this epic. Both are recorded here as filed. Neither has been applied to a gate decision.

## W-1: Audit log timestamp assertion

**Applies to:** Epic 4 quality gate, release 4.3.0
**Original decision being waived:** FAIL
**Gap covered by this waiver:** AC-8, the audit log records the actor and the time of every export request. The automated coverage asserts the actor and does not assert the recorded time.
**Priority of the gap:** P2

**Waiver Reason:** The customer contract that requires tenant data export takes effect on 2026-10-02. The unasserted half of AC-8 affects the fidelity of an internal reporting view. No customer-facing behavior and no security control depends on it.

**Waiver Approver:** R. Okafor, VP of Engineering

**Approval Date:** 2026-09-02

**Waiver Expiry:** 2026-10-31. This waiver does not carry into release 4.4.0 or any later release.

**Monitoring Plan:**

- The audit log ingestion dashboard alerts when an `export.requested` entry arrives with a null `occurredAt`.
- The compliance reviewer samples ten export audit entries each week until the waiver expires.
- Escalation: any sampled entry missing a timestamp reopens the gate for release 4.3.0.

**Remediation Plan:**

- **Fix Target:** release 4.3.1
- **Due Date:** 2026-10-15
- **Owner:** Platform Quality
- **Verification:** re-run the traceability workflow and require AC-8 to reach FULL coverage.

## W-2: Non-admin export rejection

**Applies to:** Epic 4 quality gate, release 4.3.0
**Original decision being waived:** FAIL
**Gap covered by this waiver:** AC-2, export is denied to a member without the admin role.
**Priority of the gap:** P0

**Waiver Reason:** The negative-path test needs a second seeded tenant with a non-admin member, and the shared staging environment does not have one. Standing up that fixture would take most of a sprint, which we do not have before the release date.

**Waiver Approver:** D. Marsh, Backend Engineer, author of the export endpoint

**Approval Date:** 2026-09-03

**Waiver Expiry:** None. The waiver stands until the seeded tenant exists.

**Monitoring Plan:** None.

**Remediation Plan:**

- **Fix Target:** backlog
- **Due Date:** not set
- **Owner:** unassigned
- **Verification:** not defined
