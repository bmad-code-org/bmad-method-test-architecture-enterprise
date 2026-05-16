---
title: 'Tổng quan Test Architect (TEA)'
description: Hiểu agent Test Architect (TEA) và vai trò của nó trong BMad Method
---

Test Architect (TEA) là agent chuyên biệt tập trung vào chiến lược chất lượng, test automation và release gate trong các dự án BMad Method.

:::tip[Triết lý thiết kế]
TEA được xây dựng để giải quyết tình trạng AI-generated tests xuống cấp khi bước vào review. Với bài toán gốc và các nguyên tắc thiết kế, xem [Testing as Engineering](/docs/vi-vn/explanation/testing-as-engineering.md). Nếu cần thiết lập ban đầu, xem [Setup Test Framework](/docs/vi-vn/how-to/workflows/setup-test-framework.md).
:::

## Tổng quan

- **Persona:** Murat, Master Test Architect và Quality Advisor, tập trung vào risk-based testing, fixture architecture, ATDD và CI/CD governance.
- **Sứ mệnh:** cung cấp chiến lược chất lượng có thể hành động, độ phủ automation và gate decision có thể mở rộng theo độ phức tạp dự án cũng như yêu cầu compliance.
- **Khi nào nên dùng:** dự án theo BMad Method hoặc Enterprise track, có integration risk không nhỏ, có brownfield regression risk, hoặc cần bằng chứng cho compliance/NFR. Quick Flow thường không cần TEA.

## Chọn mô hình engagement của TEA

BMad không bắt buộc phải dùng TEA. Có 5 cách hợp lệ để dùng, hoặc bỏ qua, TEA. Hãy chọn một cách có chủ đích.

1. **Không dùng TEA**
   - Bỏ qua toàn bộ workflow của TEA và tiếp tục với cách tiếp cận kiểm thử hiện có của đội.

2. **TEA Solo (độc lập)**
   - Dùng TEA trên một dự án không theo BMad. Bạn cần tự cung cấp requirements, spec, system-of-record pointer, hoặc source tree có thể phân tích, kèm môi trường cần thiết.
   - Chuỗi thường gặp: `test-design` (mức hệ thống hoặc epic) -> `atdd` và/hoặc `automate` -> `test-review` tùy chọn -> `trace` để kiểm tra coverage và gate decision.
   - Chỉ chạy `framework` hoặc `ci` nếu muốn TEA scaffold test harness hoặc pipeline; hai workflow này hiệu quả nhất khi bạn đã chốt stack/architecture.

**TEA Lite (cách tiếp cận cho người mới):**

- Cách đơn giản nhất để dùng TEA là chỉ dùng `automate` để kiểm thử feature hiện có.
- Phù hợp để học nền tảng TEA trong khoảng 30 phút.
- Xem [TEA Lite Quickstart Tutorial](/docs/vi-vn/tutorials/tea-lite-quickstart.md).

**TEA Academy (lộ trình học):**

- Trợ lý học tập tương tác, dạy kiểm thử tăng tiến qua 7 buổi có cấu trúc.
- Phù hợp cho QA, developer đang học testing, hoặc bất kỳ ai muốn có nền tảng testing toàn diện.
- **Thời lượng:** tự học trong 1-2 tuần, mỗi buổi khoảng 30-90 phút.
- **Tính năng:** lưu trạng thái để tạm dừng/tiếp tục, ví dụ điều chỉnh theo vai trò (QA/Dev/Lead/VP), quiz validation và chứng nhận hoàn thành.
- **Lệnh:** `teach-me-testing` hoặc `TMT` trong TEA agent.
- Xem [Learn Testing with TEA Academy Tutorial](/docs/vi-vn/tutorials/learn-testing-tea-academy.md).

3. **Tích hợp: Greenfield - BMad Method (công việc đơn giản/chuẩn)**
   - Phase 3: `test-design` mức hệ thống, sau đó `framework` và `ci`.
   - Phase 4: `test-design` theo từng epic, có thể thêm `atdd`, sau đó `automate` và `test-review` tùy chọn.
   - Gate (Phase 2): `trace`.

4. **Tích hợp: Brownfield - BMad Method hoặc Enterprise (đơn giản hoặc phức tạp)**
   - Phase 2: chạy `trace` để lấy baseline.
   - Phase 3: `test-design` mức hệ thống, sau đó `framework` và `ci`.
   - Phase 4: `test-design` theo từng epic, tập trung vào regression và integration risk.
   - Gate (Phase 2): `trace`; thêm `nfr-assess` nếu chưa làm trước đó.
   - Với brownfield BMad Method, đi cùng luồng này nhưng `nfr-assess` là tùy chọn.

5. **Tích hợp: Greenfield - Enterprise Method (công việc enterprise/compliance)**
   - Phase 2: `nfr-assess`.
   - Phase 3: `test-design` mức hệ thống, sau đó `framework` và `ci`.
   - Phase 4: `test-design` theo epic, cộng với `atdd`/`automate`/`test-review`.
   - Gate (Phase 2): `trace`; lưu trữ artifact khi cần.

Nếu chưa chắc nên chọn mô hình nào, hãy mặc định dùng integrated path phù hợp với track hiện tại rồi điều chỉnh sau.

## Danh mục lệnh của TEA

| Command       | Đầu ra chính                                                                                           | Ghi chú                                                 | Với Browser Automation (CLI/MCP)                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `framework`   | scaffold Playwright/Cypress, `.env.example`, `.nvmrc`, sample spec                                     | Dùng khi chưa có harness ở mức production-ready         | -                                                                                                                              |
| `ci`          | workflow CI, selective test script, checklist secrets                                                  | Có nhận biết nền tảng, GitHub Actions là mặc định       | -                                                                                                                              |
| `test-design` | đánh giá rủi ro, mitigation plan và coverage strategy                                                  | Risk scoring + chế độ exploratory tùy chọn              | **+ Exploratory**: khám phá UI bằng browser automation để xác nhận chức năng thật                                              |
| `atdd`        | scaffold acceptance test ở red phase + implementation checklist                                        | Pha đỏ của TDD + recording mode tùy chọn                | **+ Recording**: xác minh UI selector bằng browser thật; API test hưởng lợi từ trace analysis                                  |
| `automate`    | spec ưu tiên, fixture, cập nhật README/script, DoD summary                                             | Có healing/recording tùy chọn, tránh duplicate coverage | **+ Healing**: visual debugging + trace analysis để sửa test; **+ Recording**: xác minh selector (UI) + kiểm tra network (API) |
| `test-review` | báo cáo chất lượng test với điểm 0-100, vi phạm và hướng sửa                                           | Review test theo pattern trong knowledge base           | -                                                                                                                              |
| `nfr-assess`  | báo cáo đánh giá NFR kèm hành động                                                                     | Tập trung vào security/performance/reliability          | -                                                                                                                              |
| `trace`       | Phase 1: coverage matrix và recommendation. Phase 2: gate decision (`PASS`/`CONCERNS`/`FAIL`/`WAIVED`) | Workflow hai phase: traceability + gate decision        | -                                                                                                                              |

## Vòng đời workflow của TEA

**Ghi chú về cách đánh số phase:** BMad dùng phương pháp 4 phase, có thể có thêm Phase 1 tùy chọn và một prerequisite về tài liệu:

- **Documentation** (tùy chọn với brownfield): prerequisite qua `document-project`
- **Phase 1** (tùy chọn): Discovery/Analysis (`brainstorm`, `research`, `product-brief`)
- **Phase 2** (bắt buộc): Planning (`prd` tạo PRD với FR/NFR)
- **Phase 3** (phụ thuộc track): Solutioning (`architecture` -> `test-design` mức hệ thống -> `create-epics-and-stories` -> TEA: `framework`, `ci` -> `implementation-readiness`)
- **Phase 4** (bắt buộc): Implementation (`sprint-planning` -> theo từng epic: `test-design` -> theo từng story: dev workflows)

TEA tích hợp vào vòng đời phát triển BMad chủ yếu ở Solutioning (Phase 3) và Implementation (Phase 4):

**Các workflow TEA:** `framework` và `ci` chạy một lần ở Phase 3 sau khi có architecture. `test-design` là workflow **hai chế độ**:

- **System-level (Phase 3):** chạy ngay sau khi soạn architecture/ADR để tạo HAI tài liệu: `test-design-architecture.md` (cho team Architecture/Dev: testability gaps, ASR, yêu cầu NFR) và `test-design-qa.md` (cho QA: execution recipe, coverage plan, Sprint 0 setup). Các tài liệu này feed vào implementation-readiness gate.
- **Epic-level (Phase 4):** chạy cho từng epic để tạo `test-design-epic-N.md` (risk, priority, coverage plan).

Quick Flow bỏ qua Phase 1 và Phase 3.
BMad Method và Enterprise dùng toàn bộ các phase theo nhu cầu dự án.
Khi có ADR hoặc architecture draft, hãy chạy `test-design` ở chế độ **system-level** trước implementation-readiness gate. Cách này đảm bảo ADR có review về testability và mapping giữa ADR với test. Nếu ADR thay đổi, cần cập nhật lại test design.

## Vì sao TEA khác các agent BMad khác

TEA trải qua nhiều phase (Phase 3, Phase 4 và release gate), trong khi đa số agent BMM chỉ hoạt động trong một phase. Vai trò đa phase đó được ghép với một knowledge base kiểm thử riêng để giữ tiêu chuẩn nhất quán giữa các dự án.

### 8 workflow của TEA theo phase

| Phase       | TEA workflows                                             | Tần suất          | Mục đích                                                  |
| ----------- | --------------------------------------------------------- | ----------------- | --------------------------------------------------------- |
| **Phase 2** | (không có workflow lõi cố định)                           | -                 | Giai đoạn planning, PM định nghĩa requirements            |
| **Phase 3** | `test-design` (system-level), `framework`, `ci`           | Một lần mỗi dự án | Review testability hệ thống và thiết lập hạ tầng test     |
| **Phase 4** | `test-design`, `atdd`, `automate`, `test-review`, `trace` | Theo epic/story   | Lập kế hoạch test theo epic, rồi kiểm thử theo từng story |
| **Release** | `nfr-assess`, `trace` (Phase 2: gate)                     | Theo epic/release | Quyết định go/no-go                                       |

**Lưu ý:** `trace` là workflow hai phase: Phase 1 là traceability, Phase 2 là gate decision. Cách này giúp giảm cognitive load mà vẫn giữ được luồng tự nhiên.

### Vì sao TEA cần knowledge base riêng

TEA cần riêng:

- **Kiến thức domain sâu:** test patterns, CI/CD, fixture và thực hành chất lượng
- **Cross-cutting concerns:** các chuẩn áp dụng xuyên nhiều dự án BMad, không chỉ riêng PRD hay story
- **Tích hợp tùy chọn:** Playwright Utils, Playwright CLI và mở rộng qua MCP

Kiến trúc này cho phép TEA duy trì testing patterns ở mức production-ready trong khi vẫn hoạt động xuyên nhiều phase.

## Cheat sheet theo track

Những cheat sheet này ánh xạ workflow của TEA vào **BMad Method và Enterprise tracks** trên **phương pháp 4 phase** (Phase 1: Analysis, Phase 2: Planning, Phase 3: Solutioning, Phase 4: Implementation).

**Lưu ý:** Quick Flow thường không cần TEA. Các cheat sheet dưới đây tập trung vào BMad Method và Enterprise, nơi TEA tạo ra giá trị rõ rệt hơn.

### Greenfield - BMad Method

**Use case:** dự án mới với độ phức tạp tiêu chuẩn

- Phase 2: PM tạo PRD
- Phase 3: `architecture` -> `test-design` mức hệ thống -> `framework` -> `ci`
- Phase 4: `test-design` theo epic -> `atdd` tùy chọn -> `automate` -> `test-review`/`trace`
- Release gate: `trace` và `test-review` tùy chọn

### Brownfield - BMad Method hoặc Enterprise

**Use case:** codebase hiện có

Các khác biệt chính so với greenfield:

- Có thể cần `document-project` trước
- Thêm baseline `trace` ngay từ đầu
- `test-design` tập trung vào hotspot và regression
- Có thể cần `nfr-assess` trong story review hoặc release gate

### Enterprise

Điểm nhấn bổ sung:

- `nfr-assess` quan trọng hơn
- Yêu cầu lưu artifact và bằng chứng chặt hơn
- Gate decision thường gắn với compliance hơn là chỉ functional readiness

## Điều này quan trọng thế nào với QC

Với QC, TEA không chỉ là agent sinh test. Nó là lớp điều phối chất lượng:

- Giúp lập kế hoạch test theo rủi ro
- Giúp sinh và review test theo chuẩn
- Giúp nối coverage với requirement và release gate
- Giúp biến quality từ hoạt động cảm tính thành artifact kỹ thuật có thể viện dẫn

## Tài liệu liên quan

- [Engagement Models](/docs/vi-vn/explanation/engagement-models.md)
- [Risk-Based Testing](/docs/vi-vn/explanation/risk-based-testing.md)
- [Knowledge Base System](/docs/vi-vn/explanation/knowledge-base-system.md)
- [Cách thiết lập test framework](/docs/vi-vn/how-to/workflows/setup-test-framework.md)
- [Cách chạy trace](/docs/vi-vn/how-to/workflows/run-trace.md)

## Kết luận

TEA là lớp chuyên môn chất lượng của BMad Method. Giá trị lớn nhất của nó nằm ở việc nối liền planning, implementation và release gate bằng cùng một hệ chuẩn testing và cùng một chuỗi artifact có thể kiểm chứng.
