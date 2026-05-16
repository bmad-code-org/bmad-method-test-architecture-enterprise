---
title: 'Cách chạy NFR Assessment với TEA'
description: Xác thực yêu cầu phi chức năng về security, performance, reliability và maintainability bằng TEA
---

# Cách chạy NFR Assessment với TEA

Dùng workflow `nfr-assess` của TEA để đánh giá yêu cầu phi chức năng bằng cách tiếp cận dựa trên bằng chứng, trải rộng qua security, performance, reliability và maintainability.

## Khi nào nên dùng

- Dự án enterprise có yêu cầu compliance
- Dự án có ngưỡng NFR rõ ràng và nghiêm ngặt
- Trước khi phát hành production
- Khi NFR là yếu tố sống còn của dự án
- Khi security hoặc performance là yếu tố mission-critical

**Phù hợp nhất cho:**

- Dự án thuộc enterprise track
- Ngành có compliance cao như tài chính, y tế, chính phủ
- Ứng dụng lưu lượng lớn
- Hệ thống nhạy cảm về bảo mật

## Điều kiện tiên quyết

- Đã cài BMad Method
- Agent TEA có sẵn
- NFR đã được định nghĩa trong PRD hoặc requirements doc
- Có bằng chứng thì tốt hơn, nhưng không bắt buộc

**Lưu ý:** Bạn vẫn có thể chạy `nfr-assess` ngay cả khi chưa có đủ evidence. Khi thiếu dữ liệu, TEA sẽ đánh dấu các hạng mục là `CONCERNS` và ghi rõ cần bổ sung gì.

## Các bước thực hiện

### 1. Chạy workflow NFR Assessment

Mở chat mới và chạy:

```text
nfr-assess
```

### 2. Chỉ định nhóm NFR cần đánh giá

TEA sẽ hỏi bạn muốn đánh giá nhóm nào.

| Category            | Trọng tâm                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------- |
| **Security**        | Authentication, authorization, encryption, vulnerability, security header, input validation |
| **Performance**     | Response time, throughput, resource usage, DB query, frontend load time                     |
| **Reliability**     | Error handling, recovery, availability, failover, backup                                    |
| **Maintainability** | Code quality, test coverage, technical debt, documentation, dependency health               |

**Ví dụ câu trả lời:**

```text
Assess:
- Security (critical for user data)
- Performance (API must be fast)
- Reliability (99.9% uptime requirement)

Skip maintainability for now
```

### 3. Cung cấp threshold cho từng nhóm

TEA sẽ hỏi về ngưỡng chấp nhận cụ thể.

**Nguyên tắc quan trọng: không đoán threshold.** Nếu chưa biết chính xác, hãy yêu cầu TEA đánh dấu `CONCERNS` và ghi nhận cần hỏi stakeholder.

#### Security thresholds

```text
Requirements:
- All endpoints require authentication: YES
- Data encrypted at rest: YES (PostgreSQL TDE)
- Zero critical vulnerabilities: YES (npm audit)
- Input validation on all endpoints: YES (Zod schemas)
- Security headers configured: YES (helmet.js)
```

#### Performance thresholds

```text
Requirements:
- API response time P99: < 200ms
- API response time P95: < 150ms
- Throughput: > 1000 requests/second
- Frontend initial load: < 2 seconds
- Database query time P99: < 50ms
```

#### Reliability thresholds

```text
Requirements:
- Error handling: All endpoints return structured errors
- Availability: 99.9% uptime
- Recovery time: < 5 minutes (RTO)
- Data backup: Daily automated backups
- Failover: Automatic with < 30s downtime
```

#### Maintainability thresholds

```text
Requirements:
- Test coverage: > 80%
- Code quality: SonarQube grade A
- Documentation: All APIs documented
- Dependency age: < 6 months outdated
- Technical debt: < 10% of codebase
```

### 4. Cung cấp bằng chứng

TEA sẽ hỏi evidence cho từng nhóm yêu cầu.

| Category        | Loại evidence        | Vị trí ví dụ                   |
| --------------- | -------------------- | ------------------------------ |
| Security        | Security scan report | `/reports/security-scan.pdf`   |
| Security        | Vulnerability scan   | `npm audit`, `snyk test`       |
| Security        | Auth test results    | report xác thực                |
| Performance     | Load test result     | `/reports/k6-load-test.json`   |
| Performance     | APM data             | Datadog, New Relic             |
| Reliability     | Error rate metric    | dashboard giám sát             |
| Reliability     | Uptime data          | StatusPage, PagerDuty          |
| Maintainability | Coverage report      | `/reports/coverage/index.html` |
| Maintainability | Code quality         | SonarQube                      |

**Ví dụ câu trả lời:**

```text
Evidence:
- Security: npm audit results (clean), auth tests 15/15 passing
- Performance: k6 load test at /reports/k6-results.json
- Reliability: Error rate 0.01% in staging (logs in Datadog)

Don't have:
- Uptime data (new system, no baseline)
- Mark as CONCERNS and request monitoring setup
```

### 5. Review báo cáo NFR

TEA sẽ sinh báo cáo đánh giá đầy đủ hơn, ví dụ:

```markdown
# Non-Functional Requirements Assessment

**Date:** 2026-01-13
**Epic:** User Profile Management
**Release:** v1.2.0
**Overall Decision:** CONCERNS ⚠️

## Executive Summary

| Category        | Status      | Critical Issues |
| --------------- | ----------- | --------------- |
| Security        | PASS ✅     | 0               |
| Performance     | CONCERNS ⚠️ | 2               |
| Reliability     | PASS ✅     | 0               |
| Maintainability | PASS ✅     | 0               |
```

### Ví dụ kết luận về Security

- Authentication được enforce
- Không có critical vulnerability
- Input validation đầy đủ
- Security header được cấu hình

=> **PASS**

### Ví dụ kết luận về Performance

| Metric           | Target     | Actual  | Status     |
| ---------------- | ---------- | ------- | ---------- |
| API response P99 | < 200ms    | 350ms   | ❌ Exceeds |
| API response P95 | < 150ms    | 180ms   | ⚠️ Exceeds |
| Throughput       | > 1000 rps | 850 rps | ⚠️ Below   |
| Frontend load    | < 2s       | 1.8s    | ✅ Met     |
| DB query P99     | < 50ms     | 85ms    | ❌ Exceeds |

**Vấn đề 1: P99 latency vượt ngưỡng**

- Đo được: 350ms
- Nguyên nhân gốc: DB query chưa tối ưu
- Mitigation:
  - thêm index
  - xử lý N+1 query
  - chạy lại load test

**Vấn đề 2: Throughput dưới ngưỡng**

- Đo được: 850 rps
- Nguyên nhân gốc: pool kết nối quá nhỏ
- Mitigation:
  - tăng `max_connections`
  - thêm connection pooling
  - chạy lại load test

### Ví dụ kết luận về Reliability

- Structured error đầy đủ
- Uptime đạt 99.95%
- Recovery time đạt 3 phút
- Backup tự động hằng ngày
- Failover đạt 15s

=> **PASS**

### Ví dụ kết luận về Maintainability

- Coverage trên 80%
- SonarQube grade A
- API docs đầy đủ
- Dependency age chấp nhận được
- Technical debt trong ngưỡng

=> **PASS**

## Overall Gate Decision

### Decision: CONCERNS ⚠️

**Lý do:**

- Không có blocker tuyệt đối
- Có concern ở performance
- Có mitigation plan rõ ràng
- Security, reliability và maintainability đều đạt

````

## Bạn sẽ nhận được gì

### NFR assessment report

- Phân tích theo từng nhóm
- So sánh target và actual
- Gắn evidence cho từng yêu cầu
- Chỉ ra issue và root cause

### Gate decision

- **PASS** ✅ - đạt toàn bộ NFR quan trọng
- **CONCERNS** ⚠️ - chưa đạt một số ngưỡng nhưng đã có mitigation plan
- **FAIL** ❌ - có blocker phi chức năng nghiêm trọng
- **WAIVED** ⏭️ - có phê duyệt kinh doanh đi kèm chấp nhận rủi ro

### Mitigation plan

- Hành động cụ thể
- Chủ sở hữu
- Deadline
- Tiêu chí để re-assess

### Monitoring plan

- Cách theo dõi sau release
- Alert threshold
- Nhịp review

## Mẹo sử dụng

### Chạy NFR assessment sớm

**Phase 2 (Enterprise):**

- Xác định NFR sớm
- Lập kế hoạch cho performance testing
- Dự trù security audit
- Chuẩn bị monitoring

**Phase 4 hoặc release gate:**

- Chạy lại để xác nhận hệ thống thực sự đạt ngưỡng

### Đừng đoán threshold

**Không nên:**

```text
API response time should probably be under 500ms
```

**Nên làm:**

```text
Mark as CONCERNS - Request threshold from stakeholders
```

### Thu thập evidence trước khi chạy

**Security:**

```bash
npm audit
snyk test
npm run test:security
```

**Performance:**

```bash
npm run test:load
npm run test:lighthouse
npm run test:db-performance
```

**Maintainability:**

```bash
npm run test:coverage
npm run lint
npm outdated
```

### Dùng dữ liệu thật, không dùng cảm giác

**Không nên:**

```text
System is probably fast enough
Security seems fine
```

**Nên:**

```text
Load test results show P99 = 350ms
npm audit shows 0 vulnerabilities
Test coverage report shows 85%
```

### Ghi waiver thật rõ

Nếu business chấp nhận release dù còn concern, cần ghi:

- Ai phê duyệt
- Vì sao chấp nhận
- Điều kiện đi kèm
- Rủi ro được chấp nhận
- Kế hoạch khắc phục sau đó

### Re-assess sau khi sửa

Quy trình nên là:

1. Sửa issue
2. Chạy lại load test/security test/metric liên quan
3. Chạy lại `nfr-assess`
4. Xác nhận trạng thái mới

## Vấn đề thường gặp

### Không có evidence

**Cách xử lý:**

- Đánh dấu `CONCERNS`
- Ghi rõ còn thiếu evidence gì
- Thiết lập test hoặc monitoring trước lần đánh giá tiếp theo

### Threshold quá khắt khe

Nếu stakeholder đưa ra threshold không thực tế:

- Dùng dữ liệu thật để phản biện
- Đề xuất threshold phù hợp hơn
- Giải thích theo bối cảnh kỹ thuật và tải hệ thống

### Đánh giá mất quá nhiều thời gian

Hãy ưu tiên:

1. Security
2. Performance
3. Reliability
4. Maintainability

Không nhất thiết phải đánh giá mọi nhóm ở cùng một lần đầu tiên.

### CONCERNS hay FAIL?

**CONCERNS** khi:

- Vấn đề có thật nhưng chưa tới mức blocker
- Có mitigation plan
- Có thể monitor và quản trị rủi ro

**FAIL** khi:

- Có lỗ hổng bảo mật nghiêm trọng
- Hệ thống không dùng được
- Có nguy cơ mất dữ liệu
- Không có phương án giảm thiểu hợp lý

## Tài liệu liên quan

- [How to Run Trace](/vi-vn/how-to/workflows/run-trace.md)
- [How to Run Test Review](/vi-vn/how-to/workflows/run-test-review.md)
- [Run TEA for Enterprise](/vi-vn/how-to/brownfield/use-tea-for-enterprise.md)

## Hiểu thêm về khái niệm

- [Risk-Based Testing](/vi-vn/explanation/risk-based-testing.md)
- [TEA Overview](/vi-vn/explanation/tea-overview.md)

## Tham chiếu

- [Command: *nfr-assess](/vi-vn/reference/commands.md#nfr-assess)
- [TEA Configuration](/vi-vn/reference/configuration.md)

---

Tạo bằng [BMad Method](https://bmad-method.org) - TEA (Test Engineering Architect)
````
