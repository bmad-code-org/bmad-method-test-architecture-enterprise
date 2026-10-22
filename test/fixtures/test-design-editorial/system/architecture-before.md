# Test Design for Architecture: Ledger Export Service

**Purpose:** Architectural concerns, testability gaps, and NFR requirements for review by Architecture and Platform. This is a contract on what must be addressed before test development begins.

## Executive Summary

The Ledger Export Service is a truly game-changing capability that will seamlessly empower finance teams. Sources: `docs/prd.md#ledger-export`, `docs/adr/ADR-012-export-batching.md`.

## Quick Guide

### 🚨 BLOCKERS - Team Must Decide (Can't Proceed Without)

1. **Export signing key access** - It would be really great if, at some point, the platform team could perhaps think about giving the test environment a way to sign exports with a non-production key, because without it we basically cannot test anything end to end. (recommended owner: Platform)

## For Architects and Devs - Open Topics 👷

### Risk Assessment

#### High-Priority Risks (Score ≥6) - IMMEDIATE ATTENTION

| Risk ID | Category | Description                                                                                                                                         | Probability | Impact | Score | Mitigation                                   | Owner    | Timeline |
| ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------ | ----- | -------------------------------------------- | -------- | -------- |
| R-001   | DATA     | It seems that, in some cases, a batch that fails halfway through might possibly leave a partial file that downstream consumers would then import (ADR-012). | 3           | 3      | 9     | Write to a temp path and rename atomically   | Platform | Sprint 2 |
| R-002   | SEC      | Exports are signed with a key that, as far as anyone knows, is shared across all tenants, so one tenant could potentially forge another tenant's file. | 2           | 3      | 6     | Use one signing key per tenant               | Security | Sprint 3 |

#### Medium-Priority Risks (Score 3-5)

| Risk ID | Category | Description                                                                                                         | Probability | Impact | Score | Mitigation               | Owner    |
| ------- | -------- | ------------------------------------------------------------------------------------------------------------------- | ----------- | ------ | ----- | ------------------------ | -------- |
| R-003   | PERF     | A 1,000,000-row export must finish in < 15 minutes per the PRD, and honestly we have no baseline measurement yet. | 2           | 2      | 4     | Add a load baseline job  | Platform |

#### Low-Priority Risks (Score 1-2)

| Risk ID | Category | Description                                                     | Probability | Impact | Score | Action  |
| ------- | -------- | --------------------------------------------------------------- | ----- | ------ | ----- | ------- |
| R-004   | OPS      | The export dashboard is missing a panel for retry counts.       | 1           | 2      | 2     | Monitor |

### Assumptions and Dependencies

#### Assumptions

1. Tenant count stays ≤ 200 through the end of Q3 (PRD, "Scale").
2. The p99 export latency SLO is UNKNOWN; nobody has stated it yet.
