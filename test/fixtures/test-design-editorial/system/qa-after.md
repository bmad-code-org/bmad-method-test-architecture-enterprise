# Test Design for QA: Ledger Export Service

**Purpose:** Test execution recipe for QA. Risk details live in the Architecture document.

## Executive Summary

Risks: 2 high (R-001, R-002), 1 medium (R-003), 1 low (R-004).

## Risk Assessment

### High-Priority Risks (Score ≥6)

| Risk ID | Category | Description                       | Score | QA Test Coverage                                                              |
| ------- | -------- | --------------------------------- | ----- | ----------------------------------------------------------------------------- |
| R-001   | DATA     | Partial file after a failed batch | 9     | Kill the worker mid-batch, then check that no partial file appears            |
| R-002   | SEC      | Shared signing key across tenants | 6     | Check that a file signed for tenant A is rejected for tenant B                |

### Medium/Low-Priority Risks

| Risk ID | Category | Description               | Score | QA Test Coverage                    |
| ------- | -------- | ------------------------- | ----- | ----------------------------------- |
| R-003   | PERF     | Large export duration     | 4     | k6 baseline run with 1,000,000 rows |
| R-004   | OPS      | Missing retry-count panel | 2     | Manual dashboard check              |

## Test Coverage Plan

**Note:** P0/P1/P2/P3 = priority, NOT execution timing.

### P0 (Critical)

| Test IDs | Requirement                                  | Test Level | Risk Link | Test Count | Notes                                                                                                                  |
| -------- | -------------------------------------------- | ---------- | --------- | ---------: | ---------------------------------------------------------------------------------------------------------------------- |
| P0-001   | Failed batch leaves no consumer-visible file | API        | R-001     |          2 | Planned: kill the worker with `kill -9 $(pgrep export-worker)`, then assert that `ls /exports/*.csv` returns nothing. |
| P0-002   | Cross-tenant signature is rejected           | API        | R-002     |          2 | Expect `401` with the body `{"error":"signature_tenant_mismatch"}`.                                                   |

### P1 (High)

| Test IDs | Requirement           | Test Level | Risk Link | Test Count | Notes                                           |
| -------- | --------------------- | ---------- | --------- | ---------: | ----------------------------------------------- |
| P1-001   | Large export duration | API        | R-003     |          1 | Must finish in < 15 minutes for 1,000,000 rows. |

### P2 (Medium)

| Test IDs | Requirement               | Test Level | Risk Link | Test Count | Notes                 |
| -------- | ------------------------- | ---------- | --------- | ---------: | --------------------- |
| P2-001   | Retry-count panel present | E2E        | R-004     |          1 | Manual check for now. |
