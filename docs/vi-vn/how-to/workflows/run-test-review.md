---
title: 'Cách chạy Test Review với TEA'
description: Audit chất lượng test bằng knowledge base của TEA và nhận báo cáo chấm điểm từ 0-100
---

# Cách chạy Test Review với TEA

Dùng workflow `test-review` của TEA để audit chất lượng bộ test bằng chấm điểm khách quan và feedback có thể hành động ngay. TEA sẽ review test dựa trên knowledge base gồm các best practice của hệ thống.

**Lưu ý quan trọng:** `test-review` **không chấm coverage theo yêu cầu**. Nếu bạn cần phân tích coverage, map requirement với test hoặc ra gate decision theo coverage, hãy dùng `trace`.

## Khi nào nên dùng

- Muốn đánh giá chất lượng test một cách khách quan
- Cần quality metric cho quality gate
- Chuẩn bị triển khai production
- Review test do team viết
- Audit test do AI sinh ra
- Onboard thành viên mới bằng cách cho họ xem pattern tốt
- Kiểm tra chất lượng migration trước khi mở rộng coverage

## Điều kiện tiên quyết

- Đã cài BMad Method
- Agent TEA đã sẵn sàng
- Đã có test để review
- Test framework đã được cấu hình

## Các bước thực hiện

### 1. Nạp agent TEA

Mở một chat mới và chạy:

```text
tea
```

### 2. Chạy workflow Test Review

```text
test-review
```

### 3. Chỉ định phạm vi review

TEA sẽ hỏi bạn muốn review phần nào.

#### Tùy chọn A: Một file đơn lẻ

```text
tests/e2e/checkout.spec.ts
```

**Phù hợp khi:**

- Review một test file đang lỗi
- Muốn có feedback nhanh cho test mới
- Học từ một ví dụ cụ thể

#### Tùy chọn B: Một thư mục

```text
tests/e2e/
```

**Phù hợp khi:**

- Review toàn bộ suite E2E
- So sánh chất lượng giữa các file
- Tìm pattern lỗi lặp lại

#### Tùy chọn C: Toàn bộ suite

```text
tests/
```

**Phù hợp khi:**

- Kiểm tra chất lượng ở release gate
- Audit toàn diện
- Thiết lập baseline metric

### 4. Review báo cáo chất lượng

TEA sẽ sinh báo cáo chấm điểm khá đầy đủ.

#### Cấu trúc báo cáo (`test-review.md`)

````markdown
# Test Quality Review Report

**Date:** 2026-01-13
**Scope:** tests/e2e/
**Overall Score:** 76/100

## Summary

- **Tests Reviewed:** 12
- **Passing Quality:** 9 tests (75%)
- **Needs Improvement:** 3 tests (25%)
- **Critical Issues:** 2
- **Recommendations:** 6

## Critical Issues

### 1. Hard Waits Detected

**File:** `tests/e2e/checkout.spec.ts:45`
**Issue:** Using `page.waitForTimeout(3000)`
**Impact:** Test is flaky and unnecessarily slow
**Severity:** Critical

**Current Code:**

```typescript
await page.click('button[type="submit"]');
await page.waitForTimeout(3000); // ❌ Hard wait
await expect(page.locator('.success')).toBeVisible();
```
````

**Fix:**

```typescript
await page.click('button[type="submit"]');
await page.waitForResponse((resp) => resp.url().includes('/api/checkout') && resp.ok());
await expect(page.locator('.success')).toBeVisible();
```

**Why This Matters:**

- Hard wait là timeout cố định, không chờ điều kiện thật
- Test dễ fail ngẫu nhiên trên máy chậm hoặc CI
- Làm test chậm ngay cả khi response rất nhanh
- Network-first pattern đáng tin cậy hơn

---

### 2. Conditional Flow Control

**File:** `tests/e2e/profile.spec.ts:28`  
**Issue:** Dùng `if/else` để xử lý phần tử tùy chọn  
**Impact:** Hành vi test không deterministic  
**Severity:** Critical

**Current Code:**

```typescript
if (await page.locator('.banner').isVisible()) {
  await page.click('.dismiss');
}
```

**Fix:**

```typescript
await expect(page.locator('.banner')).toBeVisible();
await page.click('.dismiss');
```

Hoặc tách thành hai test độc lập cho hai trạng thái khác nhau.

---

### 1. Extract Repeated Setup

**File:** `tests/e2e/profile.spec.ts`  
**Issue:** Lặp lại login code ở mọi test  
**Severity:** Medium  
**Impact:** Tăng chi phí bảo trì

**Fix (Vanilla Playwright):**

```typescript
import { test as base, Page } from '@playwright/test';

export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('test@example.com');
    await page.getByLabel('Password').fill('password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/dashboard/);
    await use(page);
  },
});
```

**Tốt hơn khi dùng Playwright Utils:**

```typescript
import { test as base } from '@playwright/test';
import { createAuthFixtures } from '@seontechnologies/playwright-utils/auth-session';

export const test = base.extend(createAuthFixtures());
```

### 2. Add Network Assertions

**File:** `tests/e2e/api-calls.spec.ts`  
**Issue:** Không xác minh API response  
**Severity:** Low  
**Impact:** Có thể bỏ sót lỗi backend

### 3. Improve Test Names

**File:** `tests/e2e/checkout.spec.ts`  
**Issue:** Tên test mơ hồ  
**Severity:** Low  
**Impact:** Khó đọc và khó review

## Quality Scores by Category

| Category            | Score | Target | Status               |
| ------------------- | ----- | ------ | -------------------- |
| **Determinism**     | 72    | 80     | ⚠️ Needs Improvement |
| **Isolation**       | 88    | 80     | ✅ Good              |
| **Maintainability** | 70    | 80     | ⚠️ Needs Improvement |
| **Performance**     | 60    | 80     | ❌ Critical          |

## Files Reviewed

| File                         | Score  | Issues | Status               |
| ---------------------------- | ------ | ------ | -------------------- |
| `tests/e2e/checkout.spec.ts` | 65/100 | 4      | ❌ Needs Work        |
| `tests/e2e/profile.spec.ts`  | 72/100 | 3      | ⚠️ Needs Improvement |
| `tests/e2e/search.spec.ts`   | 88/100 | 1      | ✅ Good              |
| `tests/api/profile.spec.ts`  | 92/100 | 0      | ✅ Excellent         |

```

## Next Steps

1. Remove hard waits in `checkout.spec.ts`
2. Fix conditional logic in `profile.spec.ts`
3. Improve setup reuse, network assertions, and naming
```

## Cách hiểu điểm số

### Điểm số có ý nghĩa gì?

| Khoảng điểm | Diễn giải      | Hành động                                             |
| ----------- | -------------- | ----------------------------------------------------- |
| **90-100**  | Rất tốt        | Hầu như không cần chỉnh thêm, sẵn sàng cho production |
| **80-89**   | Tốt            | Chỉ nên cải thiện nhỏ                                 |
| **70-79**   | Chấp nhận được | Nên xử lý các recommendation trước release            |
| **60-69**   | Cần cải thiện  | Phải sửa critical issue và áp dụng recommendation     |
| **< 60**    | Nghiêm trọng   | Cần refactor đáng kể                                  |

### Tiêu chí chấm điểm

**Determinism (30%)**

- Test cần cho ra cùng một kết quả ở mỗi lần chạy
- Không flaky
- Không phụ thuộc môi trường

**Isolation (30%)**

- Test không phụ thuộc lẫn nhau
- Chạy được ở bất kỳ thứ tự nào
- Có dọn dẹp sau test

**Maintainability (25%)**

- Dễ đọc, dễ bảo trì
- Kích thước phù hợp
- Tên rõ ràng

**Performance (15%)**

- Thời gian chạy nhanh
- Selector hiệu quả
- Không có wait không cần thiết

**Coverage**

- Không được chấm trong `test-review`
- Dùng `trace` để đánh giá coverage, traceability và gate

## Bạn sẽ nhận được gì

### Quality report

- Overall score từ 0-100
- Điểm theo từng hạng mục
- Breakdown theo từng file

### Critical issues

- Chỉ rõ line number
- Có ví dụ code hiện tại và hướng sửa
- Giải thích vì sao vấn đề này quan trọng
- Có đánh giá mức ảnh hưởng

### Recommendations

- Đề xuất cụ thể có thể áp dụng được
- Ví dụ code
- Mức ưu tiên và severity

### Next steps

- Việc cần làm ngay
- Cải tiến ngắn hạn
- Mục tiêu chất lượng dài hạn

## Mẹo sử dụng

### Review trước release

Hãy đưa test review vào release checklist:

```markdown
## Quality Checklist (Test-Review)

- [ ] All tests passing
- [ ] Test-review quality score > 80
- [ ] Critical issues resolved
- [ ] Performance within budget
```

### Review sau khi AI sinh test

Quy trình khuyến nghị:

1. Chạy `atdd` hoặc `automate`
2. Chạy `test-review` trên test vừa sinh
3. Sửa critical issue
4. Mới commit

### Đặt quality gate

Ví dụ dùng điểm chất lượng làm gate trong CI:

```yaml
- name: Review test quality
  run: |
    if [ $SCORE -lt 80 ]; then
      echo "Test-review quality gate below threshold"
      exit 1
    fi
```

Coverage gate vẫn thuộc về `trace`, không phải `test-review`.

### Review định kỳ

- **Mỗi story:** tùy chọn
- **Mỗi epic:** nên làm
- **Mỗi release:** rất nên làm
- **Hàng quý:** audit toàn bộ suite

### Review theo phạm vi nhỏ

Nếu suite lớn, hãy chia nhỏ:

- Tuần 1: E2E
- Tuần 2: API
- Tuần 3: component test
- Tuần 4: áp dụng fix trên toàn bộ suite

## Vấn đề thường gặp

### Điểm Determinism thấp

**Dấu hiệu:**

- Test fail ngẫu nhiên
- “Works on my machine”
- CI lỗi nhưng local không tái hiện được

**Nguyên nhân thường gặp:**

- `waitForTimeout`
- `if/else` hoặc `try/catch` để điều khiển flow
- Thiếu network-first pattern

### Điểm Performance thấp

**Dấu hiệu:**

- Mỗi test chạy quá lâu
- Suite mất hàng giờ
- CI timeout

**Nguyên nhân thường gặp:**

- Wait không cần thiết
- Selector kém hiệu quả
- Không dùng parallelization
- Setup quá nặng ở mỗi test

### Điểm Isolation thấp

**Dấu hiệu:**

- Test fail khi đổi thứ tự chạy
- Fail khi chạy song song
- Dữ liệu test va chạm nhau

**Nguyên nhân thường gặp:**

- Shared global state
- Không dọn dữ liệu sau test
- Dữ liệu hard-code
- Database không reset phù hợp

### “Có quá nhiều issue để sửa”

Đừng cố sửa tất cả một lúc:

1. Sửa toàn bộ critical issue trước
2. Áp dụng 3 recommendation quan trọng nhất
3. Chạy lại `test-review`
4. Lặp tiếp

## Tài liệu liên quan

- [How to Run ATDD](/vi-vn/how-to/workflows/run-atdd.md)
- [How to Run Automate](/vi-vn/how-to/workflows/run-automate.md)
- [How to Run Trace](/vi-vn/how-to/workflows/run-trace.md)

## Hiểu thêm về khái niệm

- [Test Quality Standards](/vi-vn/explanation/test-quality-standards.md)
- [Network-First Patterns](/vi-vn/explanation/network-first-patterns.md)
- [Fixture Architecture](/vi-vn/explanation/fixture-architecture.md)

## Tham chiếu

- [Command: \*test-review](/vi-vn/reference/commands.md#test-review)
- [Knowledge Base Index](/vi-vn/reference/knowledge-base.md)

---

Tạo bằng [BMad Method](https://bmad-method.org) - TEA (Test Engineering Architect)
