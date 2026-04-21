---
title: 'Cách chạy Automate với TEA'
description: Mở rộng độ bao phủ tự động hóa kiểm thử sau khi implementation hoàn tất bằng workflow automate của TEA
---

# Cách chạy Automate với TEA

Dùng workflow `automate` của TEA để sinh bộ test đầy đủ cho các tính năng đã tồn tại. Khác với `atdd`, các test này được kỳ vọng sẽ pass ngay vì feature đã có sẵn.

## Khi nào nên dùng

- Feature đã tồn tại và đang hoạt động
- Muốn bổ sung test coverage cho code hiện có
- Cần bộ test có thể pass ngay
- Muốn mở rộng suite hiện hữu
- Cần thêm test cho code legacy

**Không nên dùng khi:**

- Feature chưa tồn tại, khi đó nên dùng `atdd`
- Muốn dùng failing test để dẫn dắt phát triển theo TDD

## Điều kiện tiên quyết

- Đã cài BMad Method
- Agent TEA đã sẵn sàng
- Test framework đã được thiết lập xong, nếu chưa thì chạy `framework`
- Feature đã được implement và đang hoạt động

**Lưu ý:** Tài liệu này dùng ví dụ với Playwright. Nếu dự án dùng Cypress thì câu lệnh và cú pháp sẽ khác.

## Các bước thực hiện

### 1. Nạp agent TEA

Mở một chat mới và chạy:

```text
tea
```

### 2. Chạy workflow Automate

```text
automate
```

### 3. Cung cấp ngữ cảnh

TEA sẽ hỏi bạn đang kiểm thử cái gì.

#### Tùy chọn A: Chế độ tích hợp với BMad (khuyến nghị)

Nếu bạn đã có artifact của BMad như story, test design hoặc PRD:

**Bạn đang kiểm thử gì?**

```text
I'm testing the user profile feature we just implemented.
Story: story-profile-management.md
Test Design: test-design-epic-1.md
```

**Tài liệu tham chiếu nên cung cấp:**

- Story file có acceptance criteria
- Tài liệu test design
- Phần PRD liên quan tới feature
- Tech spec nếu có

**Khai báo test hiện có:**

```text
We have basic tests in tests/e2e/profile-view.spec.ts
Avoid duplicating that coverage
```

TEA sẽ phân tích artifact và sinh test để:

- Bao phủ acceptance criteria của story
- Tuân theo ưu tiên từ test design, ví dụ P0 → P1 → P2
- Tránh sinh trùng với test hiện có
- Bổ sung edge case và error scenario phù hợp

#### Tùy chọn B: Chế độ độc lập

Nếu bạn dùng TEA Solo hoặc không có artifact từ BMad:

**Bạn đang kiểm thử gì?**

```text
TodoMVC React application at https://todomvc.com/examples/react/dist/
Features: Create todos, mark as complete, filter by status, delete todos
```

**Scenario cần bao phủ:**

```text
- Creating todos (happy path)
- Marking todos as complete/incomplete
- Filtering (All, Active, Completed)
- Deleting todos
- Edge cases (empty input, long text)
```

TEA sẽ phân tích ứng dụng dựa trên mô tả bạn cung cấp và sinh test tương ứng.

### 4. Chỉ định test level

TEA sẽ hỏi bạn muốn sinh test ở mức nào:

- **E2E tests** - kiểm thử luồng người dùng đầy đủ trên browser
- **API tests** - kiểm thử endpoint backend, nhanh hơn và ổn định hơn
- **Component tests** - kiểm thử UI component theo dạng cô lập
- **Mix** - kết hợp nhiều mức, thường là lựa chọn tốt nhất

**Ví dụ câu trả lời:**

```text
Generate:
- API tests for all CRUD operations
- E2E tests for critical user workflows (P0)
- Focus on P0 and P1 scenarios
- Skip P3 (low priority edge cases)
```

### 5. Review bộ test được sinh ra

TEA sẽ sinh một test suite tương đối đầy đủ theo nhiều test level.

#### API tests (`tests/api/profile.spec.ts`)

**Vanilla Playwright:**

```typescript
import { test, expect } from '@playwright/test';

test.describe('Profile API', () => {
  let authToken: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.post('/api/auth/login', {
      data: { email: 'test@example.com', password: 'password123' },
    });
    const { token } = await response.json();
    authToken = token;
  });

  test('should fetch user profile', async ({ request }) => {
    const response = await request.get('/api/profile', {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(response.ok()).toBeTruthy();
    const profile = await response.json();
    expect(profile).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      email: expect.any(String),
    });
  });

  test('should update profile successfully', async ({ request }) => {
    const response = await request.patch('/api/profile', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        name: 'Updated Name',
        bio: 'Test bio',
      },
    });

    expect(response.ok()).toBeTruthy();
    const updated = await response.json();
    expect(updated.name).toBe('Updated Name');
    expect(updated.bio).toBe('Test bio');
  });

  test('should validate email format', async ({ request }) => {
    const response = await request.patch('/api/profile', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { email: 'invalid-email' },
    });

    expect(response.status()).toBe(400);
    const error = await response.json();
    expect(error.message).toContain('Invalid email');
  });

  test('should require authentication', async ({ request }) => {
    const response = await request.get('/api/profile');
    expect(response.status()).toBe(401);
  });
});
```

**Với Playwright Utils:**

```typescript
import { test as base, expect } from '@playwright/test';
import { test as apiRequestFixture } from '@seontechnologies/playwright-utils/api-request/fixtures';
import { createAuthFixtures } from '@seontechnologies/playwright-utils/auth-session';
import { mergeTests } from '@playwright/test';
import { z } from 'zod';

const ProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
});

const authFixtureTest = base.extend(createAuthFixtures());
export const testWithAuth = mergeTests(apiRequestFixture, authFixtureTest);

testWithAuth.describe('Profile API', () => {
  testWithAuth('should fetch user profile', async ({ apiRequest, authToken }) => {
    const { status, body } = await apiRequest({
      method: 'GET',
      path: '/api/profile',
      headers: { Authorization: `Bearer ${authToken}` },
    }).validateSchema(ProfileSchema);

    expect(status).toBe(200);
    expect(body.name).toBeDefined();
  });

  testWithAuth('should update profile successfully', async ({ apiRequest, authToken }) => {
    const { status, body } = await apiRequest({
      method: 'PATCH',
      path: '/api/profile',
      body: { name: 'Updated Name', bio: 'Test bio' },
      headers: { Authorization: `Bearer ${authToken}` },
    }).validateSchema(ProfileSchema);

    expect(status).toBe(200);
    expect(body.name).toBe('Updated Name');
  });

  testWithAuth('should validate email format', async ({ apiRequest, authToken }) => {
    const { status, body } = await apiRequest({
      method: 'PATCH',
      path: '/api/profile',
      body: { email: 'invalid-email' },
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(status).toBe(400);
    expect(body.message).toContain('Invalid email');
  });
});
```

**Điểm khác biệt chính:**

- Có fixture `authToken` để tái sử dụng token xác thực
- `apiRequest` trả về `{ status, body }` gọn hơn
- Có schema validation bằng Zod nên an toàn kiểu dữ liệu hơn
- Tự động retry với lỗi 5xx
- Giảm đáng kể boilerplate

#### E2E tests (`tests/e2e/profile.spec.ts`)

```typescript
import { test, expect } from '@playwright/test';

test('should edit profile', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('test@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await page.goto('/profile');
  await page.getByRole('button', { name: 'Edit Profile' }).click();
  await page.getByLabel('Name').fill('New Name');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Profile updated')).toBeVisible();
});
```

Ngoài ra, TEA còn sinh thêm test cho validation, edge case, error path tùy theo mức ưu tiên.

#### Fixtures (`tests/support/fixtures/profile.ts`)

**Vanilla Playwright:**

```typescript
import { test as base, Page } from '@playwright/test';

type ProfileFixtures = {
  authenticatedPage: Page;
  testProfile: {
    name: string;
    email: string;
    bio: string;
  };
};

export const test = base.extend<ProfileFixtures>({
  authenticatedPage: async ({ page }, use) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('test@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/dashboard/);

    await use(page);
  },

  testProfile: async ({ request }, use) => {
    const profile = {
      name: 'Test User',
      email: 'test@example.com',
      bio: 'Test bio',
    };

    await use(profile);
  },
});
```

**Với Playwright Utils:**

```typescript
import { test as base } from '@playwright/test';
import { createAuthFixtures } from '@seontechnologies/playwright-utils/auth-session';
import { mergeTests } from '@playwright/test';
import { faker } from '@faker-js/faker';

type ProfileFixtures = {
  testProfile: {
    name: string;
    email: string;
    bio: string;
  };
};

const authTest = base.extend(createAuthFixtures());
const profileTest = base.extend<ProfileFixtures>({
  testProfile: async ({}, use) => {
    const profile = {
      name: faker.person.fullName(),
      email: faker.internet.email(),
      bio: faker.person.bio(),
    };

    await use(profile);
  },
});

export const test = mergeTests(authTest, profileTest);
export { expect } from '@playwright/test';
```

**Cách dùng:**

```typescript
import { test, expect } from '../support/fixtures/profile';

test('should update profile', async ({ page, authToken, testProfile }) => {
  await page.goto('/profile');
});
```

**Lợi ích chính:**

- Có `authToken` dùng lại giữa các test
- Dữ liệu động với faker, tránh xung đột
- Có thể compose fixture bằng `mergeTests`
- Tái sử dụng tốt giữa nhiều file test

### 6. Review các artifact bổ sung

TEA thường cập nhật thêm:

#### README (`tests/README.md`)

```markdown
# Test Suite

## Running Tests

### All Tests

npm test

### Specific Levels

npm run test:api
npm run test:e2e
npm run test:smoke

### Single File

npx playwright test tests/api/profile.spec.ts
```

#### Tóm tắt Definition of Done

```markdown
## Test Quality Checklist

✅ All tests pass on first run
✅ No hard waits (waitForTimeout)
✅ No conditionals for flow control
✅ Assertions are explicit
✅ Tests clean up after themselves
✅ Tests can run in parallel
✅ Execution time < 1.5 minutes per test
✅ Test files < 300 lines
```

### 7. Chạy test

Vì feature đã tồn tại, toàn bộ test sinh ra nên pass ngay.

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
Running 15 tests using 4 workers

  ✓ tests/api/profile.spec.ts (4 tests) - 2.1s
  ✓ tests/e2e/profile-workflow.spec.ts (2 tests) - 5.3s

  15 passed (7.4s)
```

### 8. Review độ bao phủ

Bạn có thể kiểm tra báo cáo:

```bash
npx playwright show-report
npm run test:coverage
```

Đối chiếu coverage với:

- Acceptance criteria của story
- Mức ưu tiên từ test design
- Edge case và error scenario liên quan

## Bạn sẽ nhận được gì

### Test suite tương đối đầy đủ

- **API tests** - nhanh, ổn định, tập trung vào backend
- **E2E tests** - bao phủ user workflow quan trọng
- **Component tests** - nếu framework hỗ trợ và bạn yêu cầu
- **Fixtures** - chia sẻ setup và helper dùng chung

### Component testing theo framework

TEA hỗ trợ component testing bằng tool phù hợp với framework:

| Framework      | Tool                           | Vị trí test                                 |
| -------------- | ------------------------------ | ------------------------------------------- |
| **Cypress**    | Cypress Component Testing      | `tests/component/`                          |
| **Playwright** | Vitest + React Testing Library | `tests/component/` hoặc `src/**/*.test.tsx` |

### Các đặc tính chất lượng

- **Network-first patterns** - chờ response thật thay vì timeout
- **Deterministic tests** - hạn chế flaky
- **Self-cleaning** - test không để lại dữ liệu bẩn
- **Parallel-safe** - có thể chạy song song

### Tài liệu đi kèm

- README được cập nhật
- Giải thích cấu trúc test
- Checklist chất lượng tương ứng với DoD

## Mẹo sử dụng

### Hãy chạy Test Design trước

```text
test-design
automate
```

Điều này giúp TEA tập trung vào P0/P1 thay vì sinh quá nhiều test giá trị thấp.

### Ưu tiên test level hợp lý

Không phải thứ gì cũng cần E2E.

**Chiến lược thường tốt:**

```text
- P0: API + E2E
- P1: API là chính
- P2: API happy path
- P3: bỏ qua hoặc thêm sau
```

**Lý do:**

- API test nhanh hơn E2E rất nhiều
- API test ổn định hơn
- E2E nên dành cho luồng người dùng quan trọng

### Tránh coverage trùng lặp

Hãy nói rõ test hiện có:

```text
We already have tests in:
- tests/e2e/profile-view.spec.ts
- tests/api/auth.spec.ts

Don't duplicate that coverage
```

### Browser automation là tùy chọn bổ sung

Nếu cấu hình `tea_browser_automation` là `"auto"`, `"cli"` hoặc `"mcp"`, TEA có thể dùng browser tool trong `automate` để:

- Healing selector bị hỏng
- Ghi nhận selector tốt hơn
- Chụp trace hoặc screenshot làm bằng chứng

Xem thêm: [Configure Browser Automation](/vi-vn/how-to/customization/configure-browser-automation.md)

### Sinh test theo từng vòng

Đừng cố sinh mọi thứ một lần:

1. Sinh P0 trước
2. Chạy và review
3. Sinh P1
4. Chỉ sinh P2 khi thực sự cần

## Vấn đề thường gặp

### Test pass nhưng coverage chưa đủ

**Nguyên nhân:** ngữ cảnh đầu vào chưa đủ chi tiết.

**Cách xử lý:**

```text
Generate tests for:
- All acceptance criteria in story-profile.md
- Error scenarios
- Edge cases
```

### Sinh quá nhiều test

**Nguyên nhân:** không giới hạn phạm vi hoặc ưu tiên.

**Cách xử lý:**

```text
Generate ONLY:
- P0 and P1 scenarios
- API tests for all scenarios
- E2E tests only for critical workflows
- Skip P2/P3 for now
```

### Test mới trùng coverage cũ

**Nguyên nhân:** chưa chỉ rõ test đã tồn tại.

**Cách xử lý:** khai báo cụ thể file và phạm vi coverage cũ để TEA tránh lặp.

## Tài liệu liên quan

- [How to Run Test Design](/vi-vn/how-to/workflows/run-test-design.md)
- [How to Run ATDD](/vi-vn/how-to/workflows/run-atdd.md)
- [How to Run Test Review](/vi-vn/how-to/workflows/run-test-review.md)

## Hiểu thêm về khái niệm

- [Testing as Engineering](/vi-vn/explanation/testing-as-engineering.md)
- [Risk-Based Testing](/vi-vn/explanation/risk-based-testing.md)
- [Test Quality Standards](/vi-vn/explanation/test-quality-standards.md)
- [Fixture Architecture](/vi-vn/explanation/fixture-architecture.md)

## Tham chiếu

- [Command: \*automate](/vi-vn/reference/commands.md#automate)
- [TEA Configuration](/vi-vn/reference/configuration.md)

---

Tạo bằng [BMad Method](https://bmad-method.org) - TEA (Test Engineering Architect)
