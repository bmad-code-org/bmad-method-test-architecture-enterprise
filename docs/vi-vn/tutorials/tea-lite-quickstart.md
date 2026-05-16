---
title: 'Bắt đầu với Test Architect'
description: Học các nguyên tắc cơ bản của Test Architect bằng cách tạo và chạy test cho một ứng dụng demo có sẵn trong 30 phút
---

Chào mừng! **TEA Lite** là cách đơn giản nhất để bắt đầu với TEA. Bạn chỉ cần dùng workflow `automate` để tạo test cho các tính năng đã tồn tại. Cách này đặc biệt phù hợp với người mới muốn thấy TEA tạo giá trị nhanh.

## Bạn sẽ tạo ra gì

Kết thúc tutorial khoảng 30 phút này, bạn sẽ có:

- Một Playwright test framework hoạt động được
- Bản test plan đầu tiên dựa trên rủi ro
- Một bộ test pass cho một feature của ứng dụng demo có sẵn

:::note[Điều kiện tiên quyết]

- Đã cài Node.js phiên bản 20 trở lên
- Có khoảng 30 phút tập trung
- Demo app dùng trong bài là TodoMVC: <https://todomvc.com/examples/react/dist/>
  :::

:::tip[Lộ trình nhanh]
Nạp TEA (`tea`) → scaffold framework (`framework`) → tạo test plan (`test-design`) → sinh test (`automate`) → chạy bằng `npx playwright test`.
:::

## Các cách tiếp cận TEA

Trước khi bắt đầu, nên hiểu nhanh ba cách dùng phổ biến:

- **TEA Lite**: cách dành cho người mới, tập trung vào `automate` để test feature hiện có
- **TEA Solo**: dùng TEA độc lập mà không cần full BMad Method
- **TEA Integrated**: tích hợp TEA trọn vẹn qua nhiều phase của BMad Method

Tutorial này tập trung vào **TEA Lite**, vì đây là con đường ngắn nhất để thấy TEA hoạt động thực tế.

## Bước 0: Chuẩn bị, khoảng 2 phút

Chúng ta sẽ test TodoMVC, một demo app phổ biến trong tài liệu testing.

**Demo app:** <https://todomvc.com/examples/react/dist/>

Không cần cài đặt local cho ứng dụng này. Chỉ cần mở link trong trình duyệt và thử:

1. Tạo một vài todo bằng cách nhập nội dung rồi nhấn Enter
2. Đánh dấu một vài todo là hoàn thành
3. Thử các bộ lọc `All`, `Active`, `Completed`

Bạn vừa khám phá đúng những feature mà chúng ta sắp test.

## Bước 1: Cài BMad và scaffold framework, khoảng 10 phút

### Cài BMad Method

Cài BMad theo hướng dẫn cài đặt mới nhất của dự án.

Khi trình cài đặt hỏi:

- **Select modules:** chọn `BMM: BMad Method`
- **Project name:** để mặc định hoặc nhập tên dự án
- **Experience level:** chọn `beginner` cho tutorial này
- **Planning artifacts folder:** giữ mặc định
- **Implementation artifacts folder:** giữ mặc định
- **Project knowledge folder:** giữ mặc định
- **Enable TEA Playwright Model Context Protocol (MCP) enhancements?** chọn `No` ở lần đầu
- **Using playwright-utils?** chọn `No` ở lần đầu

Sau khi cài xong, bạn sẽ thấy thư mục `_bmad/` trong project.

### Nạp TEA agent

Bắt đầu một chat mới với AI assistant của bạn rồi gõ:

```text
tea
```

Thao tác này nạp Test Architect agent và hiển thị menu các workflow khả dụng.

### Scaffold test framework

Trong chat với TEA, chạy:

```text
framework
```

TEA sẽ hỏi một số câu như:

**Q: Tech stack của bạn là gì?**  
**A:** "We’re testing a React web application (TodoMVC)"

**Q: Muốn dùng framework nào?**  
**A:** "Playwright"

**Q: Testing scope là gì?**  
**A:** "End-to-end (E2E) testing for a web application"

**Q: Nền tảng CI/CD nào?**  
**A:** "GitHub Actions" hoặc lựa chọn bạn đang dùng

TEA sẽ sinh:

- thư mục `tests/`
- `playwright.config.ts`
- cấu trúc sample test
- `.env.example`
- `.nvmrc`

**Xác minh setup:**

```bash
npm install
npx playwright install
```

Sau bước này, bạn đã có test framework ở mức production-ready cơ bản.

## Bước 2: Test design đầu tiên, khoảng 5 phút

Đây là nơi TEA bắt đầu thể hiện điểm khác biệt: lập kế hoạch kiểm thử dựa trên rủi ro trước khi viết test.

### Chạy Test Design

Trong chat với TEA, chạy:

```text
test-design
```

TEA có thể hỏi:

**Q: System-level hay epic-level?**  
**A:** "Epic-level - I want to test TodoMVC's basic functionality"

**Q: Bạn đang test feature nào?**  
**A:** "TodoMVC's core operations - creating, completing, and deleting todos"

**Q: Có rủi ro hoặc mối quan tâm cụ thể nào không?**  
**A:** "We want to ensure the filter buttons (All, Active, Completed) work correctly"

TEA sẽ phân tích và tạo `test-design-epic-1.md`, thường gồm:

1. **Risk Assessment**
   - chấm điểm probability × impact
   - phân loại risk theo TECH, SEC, PERF, DATA, BUS, OPS
   - xác định vùng rủi ro cao

2. **Test Priorities**
   - P0: critical path như tạo và hiển thị todo
   - P1: high value như complete todo và filter
   - P2: medium value như delete todo
   - P3: low value hoặc edge case

3. **Coverage Strategy**
   - nên dùng E2E ra sao
   - scenario nào bắt buộc phải test
   - gợi ý cấu trúc suite

Hãy mở file test design và đọc nó. Đây là điểm rất hữu ích cho QC vì nó trả lời rõ: **cần test gì trước và vì sao**.

## Bước 3: Sinh test cho feature hiện có, khoảng 5 phút

Đây là lúc TEA bắt đầu tạo test dựa trên kế hoạch vừa có.

### Chạy Automate

Trong chat với TEA, chạy:

```text
automate
```

Ví dụ câu trả lời:

**Q: What are you testing?**  
**A:** "TodoMVC React app at <https://todomvc.com/examples/react/dist/> - focus on the test design we just created"

**Q: Reference existing docs?**  
**A:** "Yes, use test-design-epic-1.md"

**Q: Any specific test scenarios?**  
**A:** "Cover the P0 and P1 scenarios from the test design"

TEA sẽ sinh các file như:

- `tests/e2e/todomvc.spec.ts`
- `tests/README.md`
- tóm tắt Definition of Done

Ví dụ test được sinh:

```typescript
import { test, expect } from '@playwright/test';

test.describe('TodoMVC - Core Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://todomvc.com/examples/react/dist/');
  });

  test('should create a new todo', async ({ page }) => {
    const todoInput = page.locator('.new-todo');
    await todoInput.fill('Buy groceries');
    await todoInput.press('Enter');

    await expect(page.locator('.todo-list li')).toContainText('Buy groceries');
  });

  test('should mark todo as complete', async ({ page }) => {
    const todoInput = page.locator('.new-todo');
    await todoInput.fill('Complete tutorial');
    await todoInput.press('Enter');

    await page.locator('.todo-list li .toggle').click();
    await expect(page.locator('.todo-list li')).toHaveClass(/completed/);
  });

  test('should filter todos by status', async ({ page }) => {
    const todoInput = page.locator('.new-todo');
    await todoInput.fill('Buy groceries');
    await todoInput.press('Enter');
    await todoInput.fill('Write tests');
    await todoInput.press('Enter');

    await page.locator('.todo-list li .toggle').first().click();

    await page.locator('.filters a[href=\"#/active\"]').click();
    await expect(page.locator('.todo-list li')).toHaveCount(1);
    await expect(page.locator('.todo-list li')).toContainText('Write tests');

    await page.locator('.filters a[href=\"#/completed\"]').click();
    await expect(page.locator('.todo-list li')).toHaveCount(1);
    await expect(page.locator('.todo-list li')).toContainText('Buy groceries');
  });
});
```

### Khi bật Playwright Utils

Nếu cấu hình `tea_use_playwright_utils: true`, TEA có thể sinh test với utility production-ready thay vì chỉ dùng Playwright API cơ bản. Điều này đặc biệt hữu ích khi suite bắt đầu lớn hơn và cần fixture chuẩn hóa.

## Bước 4: Chạy test, khoảng 3 phút

Chạy toàn bộ test:

```bash
npx playwright test
```

Chạy với giao diện:

```bash
npx playwright test --ui
```

Chạy ở chế độ debug:

```bash
npx playwright test --debug
```

Nếu mọi thứ ổn, bạn sẽ thấy suite pass trên demo app.

## Bạn vừa học được gì

- TEA không sinh test theo kiểu ngẫu nhiên
- `test-design` giúp QC ưu tiên đúng vùng cần bao phủ
- `automate` dùng kế hoạch đó để mở rộng coverage sau implementation
- `framework` giúp khởi tạo hạ tầng test theo hướng production-ready

## Khi nào nên dừng ở TEA Lite

TEA Lite là điểm khởi đầu rất tốt nếu:

- bạn đang học TEA
- muốn thấy kết quả nhanh
- đang test feature đã có sẵn

Nhưng nếu bạn cần:

- failing acceptance tests trước khi dev
- release gate có bằng chứng
- audit test chất lượng trên toàn suite
- NFR/compliance review

thì bạn nên tiến lên `TEA Solo` hoặc `TEA Integrated`.

## Bước tiếp theo

- Muốn học có lộ trình hơn: [TEA Academy](/docs/vi-vn/tutorials/learn-testing-tea-academy.md)
- Muốn hiểu toàn cảnh: [TEA Overview](/docs/vi-vn/explanation/tea-overview.md)
- Muốn đi sâu vào workflow sinh test: [Automate Workflow](/docs/vi-vn/how-to/workflows/run-automate.md)
- Muốn học lập kế hoạch test tốt hơn: [Run Test Design](/docs/vi-vn/how-to/workflows/run-test-design.md)

---

Được tạo bằng [BMad Method](https://bmad-method.org) - TEA (Test Engineering Architect)
