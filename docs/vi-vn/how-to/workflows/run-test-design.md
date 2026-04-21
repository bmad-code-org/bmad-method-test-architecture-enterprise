---
title: 'Cách chạy Test Design với TEA'
description: Cách tạo test plan toàn diện bằng workflow test-design của TEA
---

Sử dụng workflow `test-design` của TEA để tạo test plan toàn diện với risk assessment và coverage strategy.

## Khi nào nên dùng

**System-level (Phase 3):**

- Sau khi architecture hoàn tất
- Trước implementation-readiness gate
- Khi cần đánh giá testability của kiến trúc

**Epic-level (Phase 4):**

- Ở đầu mỗi epic
- Trước khi implement stories trong epic đó
- Khi cần xác định nhu cầu kiểm thử riêng cho epic

:::note[Điều kiện tiên quyết]

- Đã cài BMad Method
- Có TEA agent
- Với system-level: architecture document đã hoàn chỉnh
- Với epic-level: epic đã được định nghĩa cùng stories
  :::

## Các bước thực hiện

### 1. Nạp TEA agent

Bắt đầu một chat mới và nạp TEA.

### 2. Chạy workflow test-design

```text
test-design
```

### 3. Chọn mode

TEA sẽ hỏi bạn muốn:

- **System-level** - review testability ở mức kiến trúc
- **Epic-level** - lập kế hoạch test cho một epic cụ thể

### 4. Cung cấp context

Với **system-level**:

- trỏ tới architecture document
- tham chiếu ADR nếu có
- cung cấp PRD hoặc các NFR liên quan

Với **epic-level**:

- chỉ rõ epic đang chuẩn bị
- tham chiếu file epic có stories
- nêu acceptance criteria, dependency và integration risk nếu có

### 5. Review output

TEA sẽ sinh một hoặc nhiều tài liệu test design tùy mode.

## Bạn sẽ nhận được gì

### Output system-level: hai tài liệu riêng

TEA tạo **hai tài liệu tách biệt** trong mode system-level:

1. **`test-design-architecture.md`**
   - dành cho team Architecture/Dev
   - nêu concern kiến trúc, gap về testability và yêu cầu NFR
   - có Quick Guide với các mức như blocker, high priority, info only
   - có risk assessment và mitigation cho rủi ro cao

2. **`test-design-qa.md`**
   - dành cho team QA
   - đóng vai trò như recipe thực thi test
   - có test environment requirements
   - có testability assessment
   - có test levels strategy
   - có coverage plan P0/P1/P2/P3 với scenario cụ thể
   - có Sprint 0 setup requirements
   - có tóm tắt NFR readiness

### Vì sao lại chia làm hai tài liệu

- Team architecture có thể quét blocker rất nhanh
- Team QA có tài liệu hành động được, theo kiểu step-by-step
- Tránh trùng lặp
- Tách bạch rõ "cần giao gì" và "sẽ test như thế nào"

### Output epic-level: một tài liệu

**`test-design-epic-N.md`**

Tài liệu này thường gồm:

- risk assessment cho epic
- mức ưu tiên test P0-P3
- coverage plan
- regression hotspot nếu là brownfield
- integration risk
- mitigation strategy

## Test Design theo từng track

| Track          | Trọng tâm Phase 3                    | Trọng tâm Phase 4                      |
| -------------- | ------------------------------------ | -------------------------------------- |
| **Greenfield** | review testability ở mức hệ thống    | risk assessment và test plan theo epic |
| **Brownfield** | system-level + baseline test hiện có | hotspot regression và integration risk |
| **Enterprise** | testability có xét compliance        | security/performance/compliance focus  |

## Ví dụ

**System-level (hai tài liệu):**

- `cluster-search-test-design-architecture.md`
- `cluster-search-test-design-qa.md`

**Pattern quan trọng:**

- Tài liệu architecture sẽ chỉ ra risk và blocker
- Tài liệu QA sẽ chỉ ra test scenario và trình tự thực thi
- Hai tài liệu tham chiếu chéo lẫn nhau, không lặp lại nội dung

## Mẹo thực hành

- Chạy **system-level ngay sau architecture** để phát hiện gap testability sớm
- Chạy **epic-level ở đầu mỗi epic** để không viết test theo cảm tính
- Nếu ADR thay đổi, cập nhật lại test design
- Dùng output của `test-design` để feed cho `atdd` và `automate`
- Team architecture nên review tài liệu architecture
- Team QA nên dùng tài liệu QA như implementation guide

## Câu hỏi QC nên chuẩn bị trước khi chạy

- Luồng nào chạm trực tiếp tới giá trị nghiệp vụ?
- Tích hợp nào có xác suất fail cao?
- Phần nào khó quan sát hoặc khó mô phỏng?
- Có role, permission, dữ liệu hay điều kiện môi trường đặc biệt nào không?
- Với brownfield, hotspot regression nằm ở đâu?

## Bước tiếp theo

Sau `test-design`, thường sẽ tiếp tục theo một trong các hướng:

1. **Setup Test Framework** nếu hạ tầng test chưa có
2. **Implementation Readiness** nếu đang ở system-level
3. **Story Implementation** nếu đang ở epic-level
4. **ATDD** nếu muốn sinh failing tests trước khi dev
5. **Automate** nếu muốn mở rộng coverage sau implementation

## Tài liệu liên quan

- [Setup Test Framework](/docs/vi-vn/how-to/workflows/setup-test-framework.md)
- [Run ATDD](/docs/vi-vn/how-to/workflows/run-atdd.md)
- [Run Automate](/docs/vi-vn/how-to/workflows/run-automate.md)
- [Risk-Based Testing](/docs/vi-vn/explanation/risk-based-testing.md)
- [TEA Overview](/docs/vi-vn/explanation/tea-overview.md)

---

Được tạo bằng [BMad Method](https://bmad-method.org) - TEA (Test Engineering Architect)
