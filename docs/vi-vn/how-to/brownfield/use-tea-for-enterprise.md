---
title: 'Chạy TEA cho dự án enterprise'
description: Dùng TEA trong môi trường enterprise có yêu cầu về compliance, security, audit và quy định pháp lý
---

# Chạy TEA cho dự án enterprise

Dùng TEA cho các dự án enterprise có yêu cầu về compliance, security, audit và regulatory. Hướng dẫn này bao phủ NFR assessment, audit trail và việc thu thập evidence.

## Khi nào nên dùng

- Dự án thuộc enterprise track, không phải Quick Flow hay BMad Method đơn giản
- Có yêu cầu compliance như SOC 2, HIPAA, GDPR, v.v.
- Ứng dụng có tính chất security-critical như tài chính, y tế, chính phủ
- Cần audit trail
- Có threshold nghiêm ngặt cho performance, security và reliability

## Điều kiện tiên quyết

- Đã cài BMad Method và chọn enterprise track
- Agent TEA có sẵn
- Yêu cầu compliance đã được tài liệu hóa
- Đã xác định stakeholder phê duyệt gate

## Workflow TEA đặc thù cho enterprise

### NFR Assessment (`nfr-assess`)

**Mục đích:** xác thực yêu cầu phi chức năng bằng bằng chứng.

**Khi dùng:** Phase 2 (sớm) và Release Gate

**Vì sao enterprise cần workflow này:**

- Compliance bắt buộc threshold cụ thể
- Audit trail là điều kiện cần cho chứng nhận
- Security requirements không thể thương lượng
- SLA về hiệu năng mang tính hợp đồng

**Ví dụ:**

```text
nfr-assess

Categories: Security, Performance, Reliability, Maintainability

Security thresholds:
- Zero critical vulnerabilities (required by SOC 2)
- All endpoints require authentication
- Data encrypted at rest (FIPS 140-2)
- Audit logging on all data access

Evidence:
- Security scan: reports/nessus-scan.pdf
- Penetration test: reports/pentest-2026-01.pdf
- Compliance audit: reports/soc2-evidence.zip
```

**Đầu ra:** báo cáo NFR với trạng thái `PASS` / `CONCERNS` / `FAIL` cho từng category.

### Trace với audit evidence (`trace`)

**Mục đích:** requirements traceability kèm audit trail.

**Khi dùng:** Phase 2 (baseline), Phase 4 (refresh), Release Gate

**Vì sao enterprise cần workflow này:**

- Auditor cần mapping từ requirement tới test
- Chứng nhận compliance cần traceability
- Cơ quan quản lý yêu cầu evidence

**Ví dụ:**

```text
trace Phase 1

Requirements: PRD.md (with compliance requirements)
Test location: tests/

Output: traceability-matrix.md with:
- Requirement-to-test mapping
- Compliance requirement coverage
- Gap prioritization
- Recommendations
```

**Cho Release Gate:**

```text
trace Phase 2

Generate gate-decision-{gate_type}-{story_id}.md with:
- Evidence references
- Approver signatures
- Compliance checklist
- Decision rationale
```

### Test Design có trọng tâm compliance (`test-design`)

**Mục đích:** đánh giá rủi ro với trọng tâm compliance và security.

**Khi dùng:** Phase 3 (system-level), Phase 4 (epic-level)

**Vì sao enterprise cần workflow này:**

- Kiến trúc bảo mật phải được kiểm tra về testability
- Compliance requirements phải có khả năng kiểm thử
- Performance requirements mang tính hợp đồng

**Ví dụ:**

```text
test-design

Mode: System-level

Focus areas:
- Security architecture (authentication, authorization, encryption)
- Performance requirements (SLA: P99 <200ms)
- Compliance (HIPAA PHI handling, audit logging)

Output: TWO documents (system-level):
- test-design-architecture.md: Security gaps, compliance requirements, performance SLOs for Architecture team
- test-design-qa.md: Security testing strategy, compliance test mapping, performance testing plan for QA team
- Audit logging validation
```

## Vòng đời TEA cho enterprise

### Phase 1: Discovery (tùy chọn nhưng nên có)

**Nghiên cứu yêu cầu compliance sớm:**

```text
Analyst: research

Topics:
- Industry compliance (SOC 2, HIPAA, GDPR)
- Security standards (OWASP Top 10)
- Performance benchmarks (industry P99)
```

### Phase 2: Planning (bắt buộc)

**1. Định nghĩa NFR từ sớm:**

```text
PM: prd

Include in PRD:
- Security requirements (authentication, encryption)
- Performance SLAs (response time, throughput)
- Reliability targets (uptime, RTO, RPO)
- Compliance mandates (data retention, audit logs)
```

**2. Đánh giá NFR:**

```text
TEA: nfr-assess

Categories: All (Security, Performance, Reliability, Maintainability)

Output: nfr-assessment.md
- NFR requirements documented
- Acceptance criteria defined
- Test strategy planned
```

**3. Baseline (chỉ với brownfield):**

```text
TEA: trace Phase 1

Establish baseline coverage before new work
```

### Phase 3: Solutioning (bắt buộc)

**1. Architecture kèm testability review:**

```text
Architect: architecture

TEA: test-design (system-level)

Focus:
- Security architecture testability
- Performance testing strategy
- Compliance requirement mapping
```

**2. Hạ tầng kiểm thử:**

```text
TEA: framework

Requirements:
- Separate test environments (dev, staging, prod-mirror)
- Secure test data handling (PHI, PII)
- Audit logging in tests
```

**3. CI/CD có tính compliance:**

```text
TEA: ci

Requirements:
- Secrets management (Vault, AWS Secrets Manager)
- Test isolation (no cross-contamination)
- Artifact retention (compliance audit trail)
- Access controls (who can run production tests)
```

### Phase 4: Implementation (bắt buộc)

Cho mỗi epic:

```text
1. test-design
2. atdd (optional)
3. implement
4. automate
5. test-review
6. trace Phase 1
```

### Release Gate

1. Chạy `nfr-assess` lần cuối
2. Chạy `test-review` trên toàn bộ suite
3. Chạy `trace` Phase 2 để ra gate decision
4. Lưu trữ toàn bộ artifact phục vụ audit

## Yêu cầu đặc thù của enterprise

### Thu thập evidence

Các artifact thường cần:

- Traceability matrix
- Kết quả chạy test có timestamp
- NFR assessment report
- Kết quả security scan
- Kết quả performance test
- Gate decision record
- Chữ ký hoặc phê duyệt từ người có thẩm quyền

**Ví dụ cấu trúc lưu trữ:**

```text
compliance/
├── 2026-Q1/
│   ├── release-1.2.0/
│   │   ├── traceability-matrix.md
│   │   ├── test-review.md
│   │   ├── nfr-assessment.md
│   │   ├── gate-decision-release-v1.2.0.md
│   │   ├── test-results/
│   │   ├── security-scans/
│   │   └── approvals.pdf
```

### Approval workflow

Enterprise thường cần phê duyệt nhiều tầng:

```markdown
## Gate Approvals Required

### Technical Approval

- [ ] QA Lead
- [ ] Tech Lead
- [ ] Security Lead

### Business Approval

- [ ] Product Manager
- [ ] Compliance Officer

### Executive Approval

- [ ] VP Engineering
- [ ] CTO
```

### Compliance checklist

**Ví dụ SOC 2:**

- Authentication cho mọi endpoint
- Authorization đã được test
- Session management an toàn
- Audit log đầy đủ
- Dữ liệu được mã hóa

**Ví dụ HIPAA:**

- PHI được mã hóa khi lưu và khi truyền
- RBAC đã được test
- Có audit trail cho truy cập dữ liệu
- Breach notification workflow đã được kiểm tra

## Mẹo cho enterprise

### Bắt đầu từ security

Security thường là ưu tiên số 1:

1. Liệt kê security requirements
2. Sinh security test bằng `atdd`
3. Chạy security suite
4. Chỉ chuyển bước khi security đạt ngưỡng

### Đặt threshold cao hơn

Ví dụ mục tiêu enterprise:

- Coverage >85%
- Quality score >85
- P0 coverage = 100%
- P1 coverage >95%

### Ghi lại mọi quyết định

Auditor thường cần:

- Vì sao đưa ra quyết định đó
- Ai phê duyệt
- Khi nào
- Dựa trên evidence nào

### Lập ngân sách cho compliance testing

Compliance testing có chi phí thật:

- Pentest
- Security audit
- Performance testing tool
- Compliance consulting

Đây không phải phần "nên có", mà thường là bắt buộc.

### Dùng validator bên ngoài

Đừng tự chứng nhận hoàn toàn:

- Pentest nên có bên thứ ba
- Security audit nên độc lập
- Compliance nên do đơn vị chứng nhận thực hiện

Vai trò của TEA là chuẩn bị cho validation bên ngoài, không thay thế nó.

## Tài liệu liên quan

- [How to Run NFR Assessment](/vi-vn/how-to/workflows/run-nfr-assess.md)
- [How to Run Trace](/vi-vn/how-to/workflows/run-trace.md)
- [How to Run Test Review](/vi-vn/how-to/workflows/run-test-review.md)
- [How to Run Test Design](/vi-vn/how-to/workflows/run-test-design.md)
- [Using TEA with Existing Tests](/vi-vn/how-to/brownfield/use-tea-with-existing-tests.md)
- [Integrate Playwright Utils](/vi-vn/how-to/customization/integrate-playwright-utils.md)

## Hiểu thêm về khái niệm

- [Engagement Models](/vi-vn/explanation/engagement-models.md)
- [Risk-Based Testing](/vi-vn/explanation/risk-based-testing.md)
- [Test Quality Standards](/vi-vn/explanation/test-quality-standards.md)
- [TEA Overview](/vi-vn/explanation/tea-overview.md)
