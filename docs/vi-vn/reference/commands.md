---
title: 'Tham chiếu lệnh TEA'
description: Bảng tham chiếu nhanh cho toàn bộ 9 workflow của TEA - đầu vào, đầu ra và liên kết tới hướng dẫn chi tiết
---

# Tham chiếu lệnh TEA

Đây là bảng tham chiếu nhanh cho toàn bộ 9 workflow của TEA (Test Engineering Architect). Nếu cần hướng dẫn từng bước, hãy xem tài liệu how-to.

Tất cả workflow liệt kê dưới đây hiện đều được hỗ trợ, bao gồm cả `nfr-assess`.

**Cách gọi theo công cụ:**

- **Claude Code / Cursor / Windsurf:** dùng slash command, ví dụ `/bmad:tea:automate`
- **Codex:** dùng `$` skills trong `.agents/skills`, ví dụ `$bmad-tea-testarch-automate`
- **TEA extension tùy biến:** đóng gói workflow thành custom content/module rồi gắn vào `bmad-tea` qua customization. Xem [Extend TEA with Custom Workflows](../how-to/customization/extend-tea-with-custom-workflows.md)

## Mục lục nhanh

- [`teach-me-testing`](#teach-me-testing) - Học kiểm thử với TEA Academy
- [`framework`](#framework) - Scaffold test framework
- [`ci`](#ci) - Thiết lập pipeline CI/CD
- [`test-design`](#test-design) - Lập kế hoạch kiểm thử dựa trên rủi ro
- [`atdd`](#atdd) - Acceptance TDD
- [`automate`](#automate) - Test automation
- [`test-review`](#test-review) - Audit chất lượng
- [`nfr-assess`](#nfr-assess) - Đánh giá NFR
- [`trace`](#trace) - Truy vết coverage

---

## teach-me-testing

**Mục đích:** trợ lý học tập tương tác, dạy kiểm thử từ nền tảng đến thực hành nâng cao

**Phase:** Learning / Onboarding (trước mọi phase khác)

**Tần suất:** mỗi người học một lần, có thể quay lại bất kỳ session nào

**Đầu vào chính:**

- Vai trò (QA, Dev, Lead, VP)
- Mức kinh nghiệm (beginner, intermediate, experienced)
- Mục tiêu học tập

**Đầu ra chính:**

- File theo dõi tiến độ (`teaching-progress/{user}-tea-progress.yaml`)
- Ghi chú cho từng session đã hoàn thành
- Chứng nhận hoàn thành (sau cả 7 session)
- Learning artifacts như note và ví dụ test

**7 session chính:**

1. Quick Start (30 phút) - giới thiệu TEA Lite và engagement models
2. Core Concepts (45 phút) - risk-based testing, P0-P3, DoD
3. Architecture (60 phút) - fixtures, network-first, data factories
4. Test Design (60 phút) - risk assessment và coverage planning
5. ATDD & Automate (60 phút) - TDD red-green và test generation
6. Quality & Trace (45 phút) - test review, traceability, metrics
7. Advanced Patterns (liên tục) - khám phá 42 knowledge fragments theo nhu cầu

**Tính năng:**

- Nhiều session với khả năng lưu trạng thái để pause/resume
- Không tuyến tính hoàn toàn, có thể nhảy vào bất kỳ session nào theo kinh nghiệm
- Quiz validation với ngưỡng đỗ **>= 70%**
- Ví dụ điều chỉnh theo vai trò (QA/Dev/Lead/VP)
- Tự động theo dõi tiến độ

**How-To Guide:** [Learn Testing with TEA Academy](/docs/vi-vn/how-to/workflows/teach-me-testing.md)

**Tutorial:** [Learn Testing with TEA Academy](/docs/vi-vn/tutorials/learn-testing-tea-academy.md)

---

## framework

**Mục đích:** scaffold production-ready test framework (Playwright hoặc Cypress)

**Phase:** Phase 3 (Solutioning)

**Tần suất:** một lần mỗi dự án

**Đầu vào chính:**

- Tech stack, lựa chọn test framework, testing scope

**Đầu ra chính:**

- Thư mục `tests/` với `support/fixtures/` và `support/helpers/`
- `playwright.config.ts` hoặc `cypress.config.ts`
- `.env.example`, `.nvmrc`
- Sample tests theo best practice

**How-To Guide:** [Setup Test Framework](/docs/vi-vn/how-to/workflows/setup-test-framework.md)

---

## ci

**Mục đích:** thiết lập pipeline CI/CD với selective testing và burn-in

**Phase:** Phase 3 (Solutioning)

**Tần suất:** một lần mỗi dự án

**Đầu vào chính:**

- Nền tảng CI (GitHub Actions, GitLab CI, v.v.)
- Sharding strategy, burn-in preferences

**Đầu ra chính:**

- CI workflow theo nền tảng (`.github/workflows/test.yml`, v.v.)
- Cấu hình chạy song song
- Burn-in loops để phát hiện flaky test
- Checklist secrets

**How-To Guide:** [Setup CI Pipeline](/docs/vi-vn/how-to/workflows/setup-ci.md)

---

## test-design

**Mục đích:** lập kế hoạch kiểm thử dựa trên rủi ro cùng coverage strategy

**Phase:** Phase 3 (system-level), Phase 4 (epic-level)

**Tần suất:** một lần ở mức hệ thống, sau đó theo từng epic

**Chế độ:**

- **System-level:** review testability ở mức kiến trúc, sinh **hai tài liệu**
- **Epic-level:** risk assessment theo epic, sinh **một tài liệu**

**Đầu vào chính:**

- System-level: architecture, PRD, ADR
- Epic-level: epic, stories, acceptance criteria

**Đầu ra chính:**

**System-Level (HAI tài liệu):**

- `test-design-architecture.md` - cho team Architecture/Dev
  - Quick Guide (`BLOCKERS` / `HIGH PRIORITY` / `INFO ONLY`)
  - Risk assessment có chấm điểm
  - Testability concerns và gaps
  - Mitigation plans
- `test-design-qa.md` - cho team QA
  - Test execution recipe
  - Coverage plan (P0/P1/P2/P3 có checkbox)
  - Sprint 0 setup requirements
  - NFR readiness summary

**Epic-Level (MỘT tài liệu):**

- `test-design-epic-N.md`
  - Risk assessment (điểm probability × impact)
  - Test priorities (P0-P3)
  - Coverage strategy
  - Mitigation plans

**Vì sao system-level cần 2 tài liệu?**

- Team architecture quét blocker trong <5 phút
- Team QA có test recipe có thể hành động ngay
- Giảm trùng lặp, ưu tiên cross-reference
- Tách rõ điều cần giao và cách kiểm thử

**Browser Automation (CLI/MCP):** exploratory mode để khám phá UI bằng browser thật

**How-To Guide:** [Run Test Design](/docs/vi-vn/how-to/workflows/run-test-design.md)

---

## atdd

**Mục đích:** tạo scaffold acceptance test ở red phase **trước** implementation (pha đỏ của TDD)

**Phase:** Phase 4 (Implementation)

**Tần suất:** theo từng story, tùy chọn

**Đầu vào chính:**

- Story có acceptance criteria, test design và test levels

**Đầu ra chính:**

- Red-phase test scaffolds trong `tests/api/`, `tests/e2e/` được đánh dấu bằng `test.skip()`
- Implementation checklist gắn với `story_key`
- Story metadata / handoff paths cho downstream `dev-story`

**Browser Automation (CLI/MCP):** recording mode cho skeleton UI trong trường hợp hiếm

**How-To Guide:** [Run ATDD](/docs/vi-vn/how-to/workflows/run-atdd.md)

---

## automate

**Mục đích:** mở rộng test coverage sau khi implementation hoàn tất

**Phase:** Phase 4 (Implementation)

**Tần suất:** theo từng story/feature

**Đầu vào chính:**

- Mô tả feature, test design, test hiện có để tránh duplication

**Đầu ra chính:**

- Comprehensive test suite trong `tests/e2e/`, `tests/api/`
- Fixture và README cập nhật
- Definition of Done summary

**Browser Automation (CLI/MCP):** healing + recording modes để sửa test và xác minh selector

**How-To Guide:** [Run Automate](/docs/vi-vn/how-to/workflows/run-automate.md)

---

## test-review

**Mục đích:** audit chất lượng test với thang điểm 0-100

**Phase:** Phase 4 (tùy chọn theo story), Release Gate

**Tần suất:** theo epic hoặc trước release

**Đầu vào chính:**

- Phạm vi review, có thể là file, thư mục hoặc cả suite

**Đầu ra chính:**

- `test-review.md` với quality score (0-100)
- Các vấn đề nghiêm trọng kèm hướng sửa
- Recommendations
- Category scores theo từng chiều: Determinism, Isolation, Maintainability, Performance
- Coverage guidance chỉ mang tính thông tin; coverage scoring và gate do `trace` xử lý

**Nhóm điểm:**

- Determinism: 30%
- Isolation: 30%
- Maintainability: 25%
- Performance: 15%

**How-To Guide:** [Run Test Review](/docs/vi-vn/how-to/workflows/run-test-review.md)

---

## nfr-assess

**Mục đích:** xác thực yêu cầu phi chức năng bằng bằng chứng

**Phase:** thường dùng ở planning sâu và Release Gate

**Trọng tâm:** security, performance, reliability, maintainability và các NFR quan trọng khác

**Đầu vào chính:**

- PRD, architecture, bằng chứng hiện có, ràng buộc phi chức năng

**Đầu ra chính:**

- Báo cáo NFR
- Rủi ro hoặc gap
- Hành động ưu tiên cần xử lý

**How-To Guide:** [Run NFR Assess](/docs/vi-vn/how-to/workflows/run-nfr-assess.md)

---

## trace

**Mục đích:** truy vết coverage và đưa ra gate decision

**Phase:** dùng trong lúc triển khai và đặc biệt quan trọng ở Release Gate

**Hai phase:**

- **Phase 1:** sinh coverage matrix, gap analysis và recommendation
- **Phase 2:** đưa ra `PASS`, `CONCERNS`, `FAIL` hoặc `WAIVED`

**Đầu vào chính:**

- Requirements, spec, test design, hoặc source tree có thể phân tích
- Test location và kết quả test execution (đặc biệt cho Phase 2)

**Đầu ra chính:**

- `traceability-matrix.md`
- Danh sách coverage gaps theo mức ưu tiên
- Gate decision có evidence

**How-To Guide:** [Run Trace](/docs/vi-vn/how-to/workflows/run-trace.md)
