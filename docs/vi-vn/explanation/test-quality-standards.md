---
title: 'Giải thích tiêu chuẩn chất lượng test'
description: Hiểu Definition of Done của TEA cho các test có tính xác định, cô lập và dễ bảo trì
---

# Giải thích tiêu chuẩn chất lượng test

Tiêu chuẩn chất lượng test định nghĩa điều gì làm nên một test "tốt" trong TEA. Đây không phải là gợi ý tùy chọn, mà là **Definition of Done** để ngăn test bị mục trong quá trình review.

## Tổng quan

**Các nguyên tắc chất lượng của TEA:**

- **Deterministic** - cùng đầu vào, cùng kết quả ở mọi lần chạy
- **Isolated** - không phụ thuộc test khác
- **Explicit** - assertion hiện rõ trong thân test
- **Focused** - phạm vi phù hợp, một trách nhiệm chính
- **Fast** - chạy trong thời gian hợp lý

Nếu test vi phạm những nguyên tắc này, nó tạo gánh nặng bảo trì, làm chậm phát triển và khiến cả team mất niềm tin vào suite.

## Vấn đề

### Test bị "mục" ngay trong vòng review

```typescript
test('user can do stuff', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(5000);

  if (await page.locator('.banner').isVisible()) {
    await page.click('.dismiss');
  }

  try {
    await page.click('#load-more');
  } catch (e) {
    // Bỏ qua lỗi
  }

  // ... thêm 300 dòng logic
});
```

**Các vấn đề chính:**

- Hard wait gây flaky
- Điều kiện `if/else` làm hành vi không còn xác định
- `try/catch` che mất failure
- Test quá lớn, khó hiểu
- Tên mơ hồ
- Assertion không rõ đang kiểm tra điều gì

Kết quả là PR review sẽ nhận comment kiểu "test này flaky, sửa rồi quay lại", rồi cuối cùng test không được merge hoặc bị xóa.

### AI sinh test nhưng không có quality guardrail

Không có chuẩn chất lượng, AI rất dễ sinh ra hàng loạt test kiểu:

```typescript
test('test1', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(3000);
});

test('test2', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(3000);
});
```

Kết quả là có thể có 50 test, nhưng phần lớn bị trùng, flaky và không ai dám tin.

## Lời giải: các tiêu chuẩn chất lượng của TEA

### 1. Determinism, không flaky

**Quy tắc:** test phải cho cùng kết quả ở mọi lần chạy.

**Yêu cầu:**

- Không dùng hard wait như `waitForTimeout`
- Không dùng `if/else` để điều khiển flow chính
- Không dùng `try/catch` để nuốt lỗi
- Dùng network-first patterns
- Dùng explicit wait như `waitForResponse`, `waitForSelector`

**Ví dụ xấu:**

```typescript
test('flaky test', async ({ page }) => {
  await page.click('button');
  await page.waitForTimeout(2000);

  if (await page.locator('.modal').isVisible()) {
    await page.click('.dismiss');
  }

  try {
    await expect(page.locator('.success')).toBeVisible();
  } catch (e) {
    // Test vẫn pass dù assertion fail
  }
});
```

**Ví dụ tốt với Playwright:**

```typescript
test('deterministic test', async ({ page }) => {
  const responsePromise = page.waitForResponse((resp) => resp.url().includes('/api/submit') && resp.ok());

  await page.click('button');
  await responsePromise;

  await expect(page.locator('.modal')).toBeVisible();
  await page.click('.dismiss');
  await expect(page.locator('.success')).toBeVisible();
});
```

**Với Playwright Utils:**

```typescript
import { test } from '@seontechnologies/playwright-utils/fixtures';
import { expect } from '@playwright/test';

test('deterministic test', async ({ page, interceptNetworkCall }) => {
  const submitCall = interceptNetworkCall({
    method: 'POST',
    url: '**/api/submit',
  });

  await page.click('button');

  const { status, responseJson } = await submitCall;
  expect(status).toBe(200);

  await expect(page.locator('.modal')).toBeVisible();
  await page.click('.dismiss');
  await expect(page.locator('.success')).toBeVisible();
});
```

### 2. Isolation, không phụ thuộc test khác

**Quy tắc:** mỗi test phải chạy độc lập.

**Yêu cầu:**

- Tự dọn dẹp dữ liệu
- Không phụ thuộc global state
- Có thể chạy song song
- Có thể chạy theo bất kỳ thứ tự nào
- Dùng dữ liệu test duy nhất

**Ví dụ xấu:**

```typescript
let userId: string;

test('create user', async ({ apiRequest }) => {
  const { body } = await apiRequest({
    method: 'POST',
    path: '/api/users',
    body: { email: 'test@example.com' },
  });
  userId = body.id;
});

test('update user', async ({ apiRequest }) => {
  await apiRequest({
    method: 'PATCH',
    path: `/api/users/${userId}`,
    body: { name: 'Updated' },
  });
});
```

**Vì sao không ổn:**

- Thứ tự chạy trở thành bắt buộc
- `.only` hoặc skip một test sẽ làm test khác hỏng
- Dữ liệu hard-code dễ va chạm
- Không cleanup

**Ví dụ tốt với request API thuần:**

```typescript
test('should update user profile', async ({ request }) => {
  const testEmail = `test-${Date.now()}@example.com`;

  const createResp = await request.post('/api/users', {
    data: { email: testEmail, name: 'Original' },
  });
  const user = await createResp.json();

  const updateResp = await request.patch(`/api/users/${user.id}`, {
    data: { name: 'Updated' },
  });
  const updated = await updateResp.json();

  expect(updated.name).toBe('Updated');

  await request.delete(`/api/users/${user.id}`);
});
```

**Ví dụ tốt hơn với Playwright Utils:**

```typescript
import { test } from '@seontechnologies/playwright-utils/api-request/fixtures';
import { expect } from '@playwright/test';
import { faker } from '@faker-js/faker';

test('should update user profile', async ({ apiRequest }) => {
  const testEmail = faker.internet.email();

  const { status: createStatus, body: user } = await apiRequest({
    method: 'POST',
    path: '/api/users',
    body: { email: testEmail, name: faker.person.fullName() },
  });

  expect(createStatus).toBe(201);

  const { status, body: updated } = await apiRequest({
    method: 'PATCH',
    path: `/api/users/${user.id}`,
    body: { name: 'Updated Name' },
  });

  expect(status).toBe(200);
  expect(updated.name).toBe('Updated Name');

  await apiRequest({
    method: 'DELETE',
    path: `/api/users/${user.id}`,
  });
});
```

**Điểm mạnh của Playwright Utils ở đây:**

- Trả về `{ status, body }` gọn hơn
- Không cần tự `await response.json()`
- Có retry tự động cho một số lỗi 5xx
- Có thể nối `.validateSchema()` khi cần

### 3. Explicit assertions, không giấu validation

**Quy tắc:** assertion phải nhìn thấy trực tiếp trong test body.

**Yêu cầu:**

- Assertion nằm trong test, không chôn trong helper
- Assertion cụ thể
- Kỳ vọng có ý nghĩa nghiệp vụ

**Ví dụ xấu:**

```typescript
async function verifyProfilePage(page: Page) {
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('.email')).toContainText('@');
  await expect(page.locator('.name')).not.toBeEmpty();
}

test('profile page', async ({ page }) => {
  await page.goto('/profile');
  await verifyProfilePage(page);
});
```

Vấn đề là người review không nhìn test là biết nó đang xác minh điều gì.

**Ví dụ tốt:**

```typescript
test('should display profile with correct data', async ({ page }) => {
  await page.goto('/profile');

  await expect(page.locator('h1')).toContainText('Test User');
  await expect(page.locator('.email')).toContainText('test@example.com');
  await expect(page.locator('.bio')).toContainText('Software Engineer');
  await expect(page.locator('img[alt=\"Avatar\"]')).toBeVisible();
});
```

**Ngoại lệ hợp lý:** helper dùng cho setup và cleanup, không phải để giấu assertion chính.

### 4. Focused tests, phạm vi hợp lý

**Quy tắc:** một test nên có một trách nhiệm chính và kích thước hợp lý.

**Yêu cầu:**

- Kích thước dưới khoảng 300 dòng
- Một trách nhiệm chính
- `describe` và `test` đặt tên rõ
- Phạm vi vừa đủ, không quá rộng cũng không quá vụn

**Ví dụ xấu:**

```typescript
test('complete user flow', async ({ page }) => {
  // Registration
  // Profile setup
  // Settings configuration
  // Data export
  // Tổng cộng 500 dòng
});
```

Vấn đề là failure ở dòng đầu có thể chặn luôn phần còn lại, khó debug và khó review.

**Ví dụ tốt:**

```typescript
test('should register new user', async ({ page }) => {
  await page.goto('/register');
  await page.fill('#email', 'test@example.com');
  await page.fill('#password', 'password123');
  await page.click('button[type=\"submit\"]');

  await expect(page).toHaveURL('/welcome');
  await expect(page.locator('h1')).toContainText('Welcome');
});

test('should configure user profile', async ({ page, authSession }) => {
  await authSession.login({ email: 'test@example.com', password: 'pass' });
  await page.goto('/profile');

  await page.fill('#name', 'Test User');
  await page.fill('#bio', 'Software Engineer');
  await page.click('button:has-text(\"Save\")');

  await expect(page.locator('.success')).toBeVisible();
});
```

### 5. Fast execution, có ngân sách hiệu năng

**Quy tắc:** một test đơn lẻ nên chạy trong khoảng dưới 1.5 phút.

**Yêu cầu:**

- Thời gian chạy dưới 90 giây
- Selector hiệu quả, ưu tiên `getByRole`
- Hạn chế thao tác thừa
- Có thể chạy song song

**Ví dụ xấu:**

```typescript
test('slow test', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(10000);

  for (let i = 1; i <= 10; i++) {
    await page.click(`a[href=\"/page-${i}\"]`);
    await page.waitForTimeout(5000);
  }

  await page.locator('//div[@class=\"container\"]/section[3]/div[2]/p').click();
  await page.waitForTimeout(30000);
  await expect(page.locator('.result')).toBeVisible();
});
```

**Ví dụ tốt với Playwright:**

```typescript
test('fast test', async ({ page }) => {
  const apiPromise = page.waitForResponse((resp) => resp.url().includes('/api/result') && resp.ok());

  await page.goto('/');
  await page.goto('/page-10');
  await page.getByRole('button', { name: 'Submit' }).click();
  await apiPromise;

  await expect(page.locator('.result')).toBeVisible();
});
```

**Ví dụ với Playwright Utils:**

```typescript
import { test } from '@seontechnologies/playwright-utils/fixtures';
import { expect } from '@playwright/test';

test('fast test', async ({ page, interceptNetworkCall }) => {
  const resultCall = interceptNetworkCall({
    method: 'GET',
    url: '**/api/result',
  });

  await page.goto('/');
  await page.goto('/page-10');
  await page.getByRole('button', { name: 'Submit' }).click();

  const { status, responseJson } = await resultCall;
  expect(status).toBe(200);
  await expect(page.locator('.result')).toBeVisible();
});
```

## Cách TEA áp tiêu chuẩn này

TEA dùng các tiêu chuẩn này như một thước đo review và một điều kiện hoàn thành khi sinh test:

- `atdd` và `automate` dùng chúng để sinh test đúng chuẩn ngay từ đầu
- `test-review` dùng chúng để audit test hiện có
- `framework` scaffold cấu trúc hỗ trợ deterministic và isolation

## Anti-patterns TEA đặc biệt không chấp nhận

### Hard waits

```typescript
await page.waitForTimeout(3000);
```

### Flow control bằng conditional

```typescript
if (await page.locator('.toast').isVisible()) {
  await page.click('.toast-close');
}
```

### Nuốt lỗi bằng try/catch

```typescript
try {
  await expect(page.locator('.success')).toBeVisible();
} catch (e) {}
```

### Assertion mơ hồ

```typescript
expect(value).toBeTruthy();
```

### Test ôm quá nhiều trách nhiệm

Một test vừa đăng ký, vừa thanh toán, vừa export dữ liệu thường là dấu hiệu cần tách.

## Vì sao điều này quan trọng với QC

Đối với QC, các tiêu chuẩn này biến suite từ "có vẻ chạy được" thành "có thể vận hành và bảo trì":

- Giảm flaky thật sự, không chỉ che đi
- Review có tiêu chí khách quan hơn
- Dễ truy nguyên lỗi hơn khi test fail
- Tăng khả năng dùng CI làm quality gate

## Tài liệu liên quan

- [Network-first patterns](/docs/vi-vn/explanation/network-first-patterns.md)
- [Fixture architecture](/docs/vi-vn/explanation/fixture-architecture.md)
- [Knowledge base system](/docs/vi-vn/explanation/knowledge-base-system.md)
- [Cách chạy test-review](/docs/vi-vn/how-to/workflows/run-test-review.md)
- [Cách chạy ATDD](/docs/vi-vn/how-to/workflows/run-atdd.md)
- [Cách chạy automate](/docs/vi-vn/how-to/workflows/run-automate.md)

## Kết luận

Một test đạt chuẩn trong TEA không chỉ là test pass. Nó phải:

- ổn định
- độc lập
- minh bạch
- đúng phạm vi
- đủ nhanh để team còn muốn giữ nó lại

---

Được tạo bằng [BMad Method](https://bmad-method.org) - TEA (Test Engineering Architect)
