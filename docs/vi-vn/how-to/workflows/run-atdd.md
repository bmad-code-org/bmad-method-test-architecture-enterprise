---
title: 'Cách chạy ATDD với TEA'
description: Sinh acceptance test scaffold ở pha đỏ trước khi implementation bằng workflow ATDD của TEA
---

# Cách chạy ATDD với TEA

Dùng workflow `atdd` của TEA để sinh scaffold acceptance test ở **pha đỏ** trước khi implementation bắt đầu. Hiện tại TEA sinh các scaffold này dưới dạng `test.skip()` để bạn có thể review, gắn vào story và kích hoạt dần theo từng task trong lúc implement.

## Khi nào nên dùng

- Bạn sắp implement một feature **mới**
- Muốn làm theo luồng TDD: red → green → refactor
- Muốn để test dẫn dắt việc implement
- Đang thực hành acceptance test-driven development

**Không nên dùng khi:**

- Feature đã tồn tại, lúc đó nên dùng `automate`
- Bạn cần bộ test pass ngay

## Điều kiện tiên quyết

- Đã cài BMad Method
- Agent TEA có sẵn
- Test framework đã được thiết lập xong, nếu chưa thì chạy `framework`
- Story hoặc feature đã được định nghĩa với acceptance criteria rõ ràng

**Lưu ý:** Tài liệu này dùng ví dụ với Playwright. Nếu dùng Cypress thì cú pháp sẽ khác.

## Các bước thực hiện

### 1. Nạp agent TEA

Mở chat mới và chạy:

```text
tea
```

### 2. Chạy workflow ATDD

```text
atdd
```

### 3. Cung cấp ngữ cảnh

TEA sẽ hỏi:

**Chi tiết story/feature:**

```text
We're adding a user profile page where users can:
- View their profile information
- Edit their name and email
- Upload a profile picture
- Save changes with validation
```

**Acceptance criteria:**

```text
Given I'm logged in
When I navigate to /profile
Then I see my current name and email

Given I'm on the profile page
When I click "Edit Profile"
Then I can modify my name and email

Given I've edited my profile
When I click "Save"
Then my changes are persisted
And I see a success message

Given I upload an invalid file type
When I try to save
Then I see an error message
And changes are not saved
```

**Tài liệu tham chiếu** nếu có:

- Story file
- PRD hoặc tech spec
- Test design nếu bạn đã chạy `test-design` trước đó

### 4. Chỉ định test level

TEA sẽ hỏi bạn muốn sinh scaffold ở mức nào:

- E2E tests
- API tests
- Component tests
- Kết hợp nhiều mức

### Component testing theo framework

| Framework      | Tool component testing                        |
| -------------- | --------------------------------------------- |
| **Cypress**    | Cypress Component Testing (`*.cy.tsx`)        |
| **Playwright** | Vitest + React Testing Library (`*.test.tsx`) |

**Ví dụ câu trả lời:**

```text
Generate:
- API tests for profile CRUD operations
- E2E tests for the complete profile editing flow
- Component tests for ProfileForm validation
- Focus on P0 and P1 scenarios
```

### 5. Review test được sinh ra

TEA sẽ sinh **red-phase scaffold** ở thư mục phù hợp.

#### API tests (`tests/api/profile.spec.ts`)

**Vanilla Playwright:**

```typescript
import { test, expect } from '@playwright/test';

test.describe('Profile API', () => {
  test.skip('should fetch user profile', async ({ request }) => {
    const response = await request.get('/api/profile');

    expect(response.status()).toBe(200);
    const profile = await response.json();
    expect(profile).toHaveProperty('name');
    expect(profile).toHaveProperty('email');
    expect(profile).toHaveProperty('avatarUrl');
  });

  test.skip('should update user profile', async ({ request }) => {
    const response = await request.patch('/api/profile', {
      data: {
        name: 'Updated Name',
        email: 'updated@example.com',
      },
    });

    expect(response.status()).toBe(200);
    const updated = await response.json();
    expect(updated.name).toBe('Updated Name');
    expect(updated.email).toBe('updated@example.com');
  });

  test.skip('should validate email format', async ({ request }) => {
    const response = await request.patch('/api/profile', {
      data: {
        email: 'invalid-email',
      },
    });

    expect(response.status()).toBe(400);
    const error = await response.json();
    expect(error.message).toContain('Invalid email format');
  });
});
```

**Với Playwright Utils:**

```typescript
import { test } from '@seontechnologies/playwright-utils/api-request/fixtures';
import { expect } from '@playwright/test';
import { z } from 'zod';

const ProfileSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  avatarUrl: z.string().url(),
});

test.describe('Profile API', () => {
  test.skip('should fetch user profile', async ({ apiRequest }) => {
    const { status, body } = await apiRequest({
      method: 'GET',
      path: '/api/profile',
    }).validateSchema(ProfileSchema);

    expect(status).toBe(200);
    expect(body.name).toBeDefined();
    expect(body.email).toContain('@');
  });

  test.skip('should update user profile', async ({ apiRequest }) => {
    const { status, body } = await apiRequest({
      method: 'PATCH',
      path: '/api/profile',
      body: {
        name: 'Updated Name',
        email: 'updated@example.com',
      },
    }).validateSchema(ProfileSchema);

    expect(status).toBe(200);
    expect(body.name).toBe('Updated Name');
    expect(body.email).toBe('updated@example.com');
  });

  test.skip('should validate email format', async ({ apiRequest }) => {
    const { status, body } = await apiRequest({
      method: 'PATCH',
      path: '/api/profile',
      body: { email: 'invalid-email' },
    });

    expect(status).toBe(400);
    expect(body.message).toContain('Invalid email format');
  });
});
```

**Lợi ích chính:**

- Trả về `{ status, body }` rõ ràng hơn
- Có schema validation với Zod
- Type-safe response body
- Retry tự động khi gặp 5xx
- Ít boilerplate hơn

#### E2E tests (`tests/e2e/profile.spec.ts`)

```typescript
import { test, expect } from '@playwright/test';

test.skip('should edit and save profile', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('test@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await page.goto('/profile');

  await page.getByRole('button', { name: 'Edit Profile' }).click();
  await page.getByLabel('Name').fill('Updated Name');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Profile updated')).toBeVisible();
});
```

TEA cũng sẽ sinh thêm các E2E test cho hiển thị dữ liệu, validation error và hành vi theo acceptance criteria.

#### Implementation Checklist

TEA đồng thời sinh checklist implementation:

```markdown
## Implementation Checklist

### Backend

- [ ] Create `GET /api/profile` endpoint
- [ ] Create `PATCH /api/profile` endpoint
- [ ] Add email validation middleware
- [ ] Add profile picture upload handling
- [ ] Write API unit tests

### Frontend

- [ ] Create ProfilePage component
- [ ] Implement profile form with validation
- [ ] Add file upload for avatar
- [ ] Handle API errors gracefully
- [ ] Add loading states

### Tests

- [x] API test scaffolds generated (`test.skip()`)
- [x] E2E test scaffolds generated (`test.skip()`)
- [ ] Activate and run tests during implementation
```

### 6. Xác minh scaffold pha đỏ

Đây là pha đỏ của TDD, nhưng TEA để test ở `test.skip()` cho đến khi bạn sẵn sàng xử lý từng task. Hãy review file được tạo, bỏ `test.skip()` ở test của task hiện tại và xác nhận test **fail trước** khi implement.

**Playwright:**

```bash
npx playwright test
```

**Cypress:**

```bash
npx cypress run
```

**Kỳ vọng ban đầu khi mọi scaffold vẫn đang skip:**

```text
Running 6 tests using 1 worker

  - tests/api/profile.spec.ts:3:3 › should fetch user profile
  - tests/api/profile.spec.ts:15:3 › should update user profile
  - tests/e2e/profile.spec.ts:10:3 › should edit and save profile

  6 skipped
```

Sau khi bỏ `test.skip()` khỏi test đang làm, test đó phải fail trước. Điều này xác nhận:

- Feature chưa tồn tại đầy đủ
- Test đang đóng vai trò dẫn dắt implementation
- Bạn đã có tiêu chí pass/fail rõ

### 7. Implement feature

Quy trình khuyến nghị:

1. Bắt đầu từ API test
2. Bỏ `test.skip()` ở test API đầu tiên và xác nhận trạng thái RED
3. Implement đủ để test đó pass
4. Chuyển sang test kế tiếp
5. Refactor khi đã có test bảo vệ

### 8. Xác minh test pass

Sau khi implement xong, chạy lại suite.

**Playwright:**

```bash
npx playwright test
```

**Cypress:**

```bash
npx cypress run
```

**Kỳ vọng đầu ra:**

```text
Running 6 tests using 1 worker

  ✓ tests/api/profile.spec.ts:3:3 › should fetch user profile (850ms)
  ✓ tests/api/profile.spec.ts:15:3 › should update user profile (1.2s)
  ✓ tests/api/profile.spec.ts:30:3 › should validate email format (650ms)
  ✓ tests/e2e/profile.spec.ts:10:3 › should display current profile (2.1s)
  ✓ tests/e2e/profile.spec.ts:18:3 › should edit and save profile (3.2s)
  ✓ tests/e2e/profile.spec.ts:35:3 › should show validation error (1.8s)

  6 passed (9.8s)
```

## Bạn sẽ nhận được gì

### Red-phase test scaffold

- API test cho endpoint backend
- E2E test cho user workflow
- Component test nếu bạn yêu cầu
- Tất cả ở dạng `test.skip()` cho tới khi bạn kích hoạt theo task

### Hướng dẫn implement

- Checklist những gì cần xây
- Acceptance criteria được chuyển thành assertion
- Nhận diện edge case và error path sớm

### Hỗ trợ luồng TDD

- Test dẫn dắt implementation
- Tăng tự tin khi refactor
- Biến test thành “living documentation”

## Mẹo sử dụng

### Hãy chạy Test Design trước

```text
test-design
atdd
```

### Tập trung vào P0/P1 trước

```text
Generate tests for:
- P0: Critical path
- P1: High value

Skip P2/P3 for now
```

### API trước, E2E sau

Thứ tự nên làm:

1. Sinh API test với `atdd`
2. Implement backend để API test pass
3. Sinh hoặc kích hoạt E2E test
4. Implement frontend để E2E pass

### Browser automation là tùy chọn

Nếu `tea_browser_automation` là `"auto"`, `"cli"` hoặc `"mcp"`, TEA có thể xác minh selector trên browser thật trong lúc làm `atdd`, đặc biệt hữu ích nếu bạn đã có skeleton UI.

Xem thêm: [Configure Browser Automation](/vi-vn/how-to/customization/configure-browser-automation.md)

## Tài liệu liên quan

- [How to Run Test Design](/vi-vn/how-to/workflows/run-test-design.md)
- [How to Run Automate](/vi-vn/how-to/workflows/run-automate.md)
- [How to Set Up Test Framework](/vi-vn/how-to/workflows/setup-test-framework.md)

## Hiểu thêm về khái niệm

- [Testing as Engineering](/vi-vn/explanation/testing-as-engineering.md)
- [Risk-Based Testing](/vi-vn/explanation/risk-based-testing.md)
- [Test Quality Standards](/vi-vn/explanation/test-quality-standards.md)
- [Network-First Patterns](/vi-vn/explanation/network-first-patterns.md)

## Tham chiếu

- [Command: \*atdd](/vi-vn/reference/commands.md#atdd)
- [TEA Configuration](/vi-vn/reference/configuration.md)

---

Tạo bằng [BMad Method](https://bmad-method.org) - TEA (Test Engineering Architect)
