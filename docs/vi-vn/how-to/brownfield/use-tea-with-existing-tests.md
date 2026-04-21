---
title: 'Sử dụng TEA với dự án đã có test (Brownfield)'
description: Áp dụng workflow TEA cho codebase legacy có bộ test sẵn
---

# Sử dụng TEA với dự án đã có test (Brownfield)

Hãy dùng TEA trên dự án brownfield để thiết lập baseline coverage, xác định gap và cải thiện chất lượng test mà không cần làm lại toàn bộ từ đầu.

## Khi nào nên dùng

- Codebase đã có sẵn một số test
- Bộ test legacy cần được cải thiện chất lượng
- Bạn đang thêm feature vào ứng dụng hiện có
- Cần hiểu mức coverage hiện tại
- Muốn giảm nguy cơ regression khi tiếp tục mở rộng hệ thống

## Điều kiện tiên quyết

- Đã cài BMad Method
- Agent TEA đã sẵn sàng
- Codebase hiện có test, dù chưa đầy đủ hoặc chất lượng chưa cao
- Test có thể chạy được, ít nhất là chạy để quan sát hiện trạng

**Lưu ý:** Nếu codebase hầu như chưa được tài liệu hóa, hãy chạy `document-project` trước để có baseline documentation.

## Chiến lược Brownfield

### Phase 1: Thiết lập baseline

Trước khi thay đổi bất cứ thứ gì, hãy hiểu rõ mình đang có gì.

#### Bước 1: Dùng `trace` để chốt baseline coverage

Chạy `trace` Phase 1:

```text
trace
```

**Chọn:** `Phase 1 (Requirements Traceability)`

**Cung cấp:**

- Requirements doc hiện có như PRD, story, feature spec
- Vị trí test, ví dụ `tests/`
- Focus area nếu codebase lớn

**Đầu ra:** `traceability-matrix.md`, cho bạn biết:

- Requirement nào đã có test
- Requirement nào chưa có coverage
- Mức FULL / PARTIAL / NONE
- Gap nào cần ưu tiên

**Ví dụ baseline:**

```markdown
# Baseline Coverage (Before Improvements)

**Total Requirements:** 50
**Full Coverage:** 15 (30%)
**Partial Coverage:** 20 (40%)
**No Coverage:** 15 (30%)

**By Priority:**

- P0: 50% coverage (5/10) ❌ Critical gap
- P1: 40% coverage (8/20) ⚠️ Needs improvement
- P2: 20% coverage (2/10) ✅ Acceptable
```

Đây sẽ là mốc để bạn đo mức cải thiện sau này.

#### Bước 2: Audit chất lượng với `test-review`

Chạy:

```text
test-review tests/
```

**Đầu ra:** `test-review.md` với điểm chất lượng và danh sách issue.

**Các vấn đề brownfield thường gặp:**

- Hard wait ở khắp nơi
- CSS selector mong manh
- Test phụ thuộc thứ tự chạy
- `try/catch` hoặc `if/else` để điều khiển flow
- Test không dọn dữ liệu sau khi chạy

**Ví dụ baseline quality:**

```markdown
# Quality Score: 55/100

**Critical Issues:** 12

- 8 hard waits
- 4 conditional flow control
```

### Phase 2: Ưu tiên cải tiến

Đừng cố sửa mọi thứ cùng lúc.

#### Bắt đầu từ critical path

**Ưu tiên 1: P0 requirement**

```text
Goal: Get P0 coverage to 100%

Actions:
1. Identify P0 requirements with no tests
2. Run `automate` to generate tests for missing P0 scenarios
3. Fix critical quality issues in P0 tests
```

**Ưu tiên 2: Sửa flaky test**

```text
Goal: Eliminate flakiness

Actions:
1. Identify tests with hard waits
2. Replace with network-first patterns
3. Run burn-in loops to verify stability
```

**Ví dụ hiện đại hóa:**

**Trước:**

```typescript
test('checkout completes', async ({ page }) => {
  await page.click('button[name=\"checkout\"]');
  await page.waitForTimeout(5000);
  await expect(page.locator('.confirmation')).toBeVisible();
});
```

**Sau (network-first):**

```typescript
test('checkout completes', async ({ page }) => {
  const checkoutPromise = page.waitForResponse((resp) => resp.url().includes('/api/checkout') && resp.ok());
  await page.click('button[name=\"checkout\"]');
  await checkoutPromise;
  await expect(page.locator('.confirmation')).toBeVisible();
});
```

**Sau (với Playwright Utils):**

```typescript
import { test } from '@seontechnologies/playwright-utils/fixtures';
import { expect } from '@playwright/test';

test('checkout completes', async ({ page, interceptNetworkCall }) => {
  const checkoutCall = interceptNetworkCall({
    method: 'POST',
    url: '**/api/checkout',
  });

  await page.click('button[name=\"checkout\"]');
  const { status, responseJson: order } = await checkoutCall;

  expect(status).toBe(200);
  expect(order.status).toBe('confirmed');
  await expect(page.locator('.confirmation')).toBeVisible();
});
```

**Ưu tiên 3: P1 requirement**

- Sinh test cho gap P1 có rủi ro cao
- Nâng chất lượng test từng bước

#### Tạo roadmap cải tiến

```markdown
# Test Improvement Roadmap

## Week 1: Critical Path (P0)

- [ ] Add 5 missing P0 tests
- [ ] Fix 8 hard waits
- [ ] Verify P0 coverage = 100%

## Week 2: Flakiness

- [ ] Replace all hard waits with network-first
- [ ] Fix conditional flow control
- [ ] Run burn-in loops
```

### Phase 3: Cải tiến tăng dần

#### Với feature mới trong codebase cũ

Bạn vẫn nên dùng workflow TEA đầy đủ:

```text
1. test-design
2. atdd
3. implement
4. automate
5. test-review
```

Điều này giúp code mới có chất lượng tốt từ ngày đầu, đồng thời kéo dần toàn bộ suite lên chuẩn cao hơn.

#### Với bug fix

Hãy thêm regression test:

```text
1. Reproduce bug with failing test
2. Fix bug
3. Verify test passes
4. Run test-review
5. Add to regression suite
```

#### Với refactoring

Trước và sau refactor, dùng `trace` để đảm bảo coverage không bị giảm.

### Phase 4: Cải tiến liên tục

Hãy theo dõi tiến bộ theo quý:

```text
Q1: Coverage 30%, Quality 55, Flakiness 15%
Q2: Coverage 50%, Quality 65, Flakiness 5%
Q3: Coverage 70%, Quality 75, Flakiness 1%
Q4: Coverage 85%, Quality 85, Flakiness <0.5%
```

## Mẹo đặc thù cho Brownfield

### Đừng viết lại mọi thứ

Thay vì xóa toàn bộ suite cũ:

1. Giữ lại test đang còn giá trị
2. Sửa critical issue từng bước
3. Bổ sung gap quan trọng
4. Cải tiến dần theo thời gian

### Dùng regression hotspot

Xác định khu vực hay lỗi nhất dựa trên:

- Bug report
- Khiếu nại từ người dùng
- Code complexity
- Khu vực thay đổi thường xuyên

Ưu tiên thêm test regression ở đây trước.

### Quarantine flaky test

Tạm `skip` test quá flaky, nhưng phải theo dõi:

```markdown
# Quarantined Tests

| Test                | Reason                     | Owner   | Target Fix Date |
| ------------------- | -------------------------- | ------- | --------------- |
| checkout.spec.ts:45 | Hard wait causes flakiness | QA Team | 2026-01-20      |
```

### Nâng cấp theo từng thư mục

Ví dụ:

- Tuần 1: `tests/auth/`
- Tuần 2: `tests/api/`
- Tuần 3: `tests/e2e/`

Như vậy bạn sẽ có tiến độ nhìn thấy được và rủi ro thấp hơn.

## Khó khăn thường gặp

### “Không ai biết test đang bao phủ gì”

Giải pháp:

1. Chạy `trace`
2. Review traceability matrix
3. Ghi lại baseline
4. Dùng đó làm cơ sở cải tiến

### “Test quá giòn, không dám đụng”

Giải pháp:

1. Chạy test để ghi nhận baseline
2. Sửa một vấn đề nhỏ
3. Chạy lại
4. Nếu ổn, tiếp tục

### “Không ai biết cách chạy test”

Giải pháp:

Tạo `tests/README.md` nêu:

- Cách cài dependency
- Cách chạy test
- Ý nghĩa các thư mục test
- Vấn đề thường gặp

### “Suite chạy quá lâu”

Giải pháp:

1. Sharding / parallelization
2. Selective testing
3. Chỉ chạy full suite theo lịch
4. Tối ưu test chậm

## Workflow TEA khuyến nghị cho Brownfield

```text
1. document-project (nếu thiếu tài liệu)
2. trace Phase 1
3. test-review
4. test-design (system-level)
5. framework / ci (nếu cần nâng hạ tầng)
6. per epic: test-design -> automate -> test-review -> trace
7. release gate: nfr-assess + trace Phase 2
```

## Tài liệu liên quan

- [How to Run Trace](/vi-vn/how-to/workflows/run-trace.md)
- [How to Run Test Review](/vi-vn/how-to/workflows/run-test-review.md)
- [How to Run Automate](/vi-vn/how-to/workflows/run-automate.md)
- [How to Run Test Design](/vi-vn/how-to/workflows/run-test-design.md)
- [Integrate Playwright Utils](/vi-vn/how-to/customization/integrate-playwright-utils.md)

## Hiểu thêm về khái niệm

- [Engagement Models](/vi-vn/explanation/engagement-models.md)
- [Test Quality Standards](/vi-vn/explanation/test-quality-standards.md)
- [Network-First Patterns](/vi-vn/explanation/network-first-patterns.md)
- [Risk-Based Testing](/vi-vn/explanation/risk-based-testing.md)

## Tham chiếu

- [TEA Command Reference](/vi-vn/reference/commands.md)
- [TEA Configuration](/vi-vn/reference/configuration.md)
- [Knowledge Base Index](/vi-vn/reference/knowledge-base.md)

---

Tạo bằng [BMad Method](https://bmad-method.org) - TEA (Test Engineering Architect)
