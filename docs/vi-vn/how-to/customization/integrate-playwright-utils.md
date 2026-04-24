---
title: 'Tích hợp Playwright Utils với TEA'
description: Bổ sung fixture và utility sẵn sàng cho production vào bộ test do TEA sinh ra
---

# Tích hợp Playwright Utils với TEA

Tích hợp `@seontechnologies/playwright-utils` với TEA để có fixture, utility và pattern chất lượng production trong test suite.

## Playwright Utils là gì?

Đây là thư viện utility sẵn sàng cho production, cung cấp:

- Typed API request helper
- Quản lý authentication session
- Record và replay network (HAR)
- Intercept network request
- Async polling (`recurse`)
- Structured logging
- Xác thực file CSV, PDF, XLSX, ZIP
- Burn-in testing utility
- Network error monitoring

**Repository:** <https://github.com/seontechnologies/playwright-utils>  
**npm package:** `@seontechnologies/playwright-utils`

## Khi nào nên dùng

- Bạn muốn fixture production-ready thay vì tự dựng từ đầu
- Đội của bạn hưởng lợi từ pattern chuẩn hóa
- Bạn cần utility như API testing, auth handling, network mocking
- Bạn muốn TEA sinh test theo đúng utility này
- Bạn đang xây reusable test infrastructure

**Không nên dùng khi:**

- Bạn chỉ đang mới học testing
- Đội đã có fixture library riêng
- Bạn không cần các utility này

## Điều kiện tiên quyết

- Đã cài BMad Method
- Agent TEA đã sẵn sàng
- Đã thiết lập test framework bằng Playwright
- Node.js v18 trở lên

**Lưu ý:** Playwright Utils chỉ dành cho Playwright, không dùng cho Cypress.

## Cài đặt

### Bước 1: Cài package

```bash
npm install -D @seontechnologies/playwright-utils
```

### Bước 2: Bật trong cấu hình TEA

Sửa `_bmad/tea/config.yaml`:

```yaml
tea_use_playwright_utils: true
```

### Bước 3: Kiểm tra

```bash
npm list @seontechnologies/playwright-utils
grep tea_use_playwright_utils _bmad/tea/config.yaml
```

Kết quả nên cho thấy package đã được cài và biến cấu hình đang là `true`.

## Khi bật lên thì thay đổi gì?

### Workflow `framework`

**Vanilla Playwright:**

```typescript
import { test, expect } from '@playwright/test';

test('api test', async ({ request }) => {
  const response = await request.get('/api/users');
  const users = await response.json();
  expect(response.status()).toBe(200);
});
```

**Với Playwright Utils (combined fixtures):**

```typescript
import { test } from '@seontechnologies/playwright-utils/fixtures';
import { expect } from '@playwright/test';

test('api test', async ({ apiRequest, authToken, log }) => {
  const { status, body } = await apiRequest({
    method: 'GET',
    path: '/api/users',
    headers: { Authorization: `Bearer ${authToken}` },
  });

  log.info('Fetched users', body);
  expect(status).toBe(200);
});
```

**Với selective merge:**

```typescript
import { mergeTests } from '@playwright/test';
import { test as apiRequestFixture } from '@seontechnologies/playwright-utils/api-request/fixtures';
import { test as logFixture } from '@seontechnologies/playwright-utils/log/fixtures';

export const test = mergeTests(apiRequestFixture, logFixture);
export { expect } from '@playwright/test';
```

### Workflow `atdd` và `automate`

**Không dùng Playwright Utils:**

```typescript
test('should fetch profile', async ({ request }) => {
  const response = await request.get('/api/profile');
  const profile = await response.json();
});
```

**Có dùng Playwright Utils:**

```typescript
import { test } from '@seontechnologies/playwright-utils/api-request/fixtures';

test('should fetch profile', async ({ apiRequest }) => {
  const { status, body } = await apiRequest({
    method: 'GET',
    path: '/api/profile',
  }).validateSchema(ProfileSchema);

  expect(status).toBe(200);
});
```

### Workflow `test-review`

- Nếu không bật utility này, TEA review theo Playwright pattern chung
- Nếu bật, TEA review theo best practice riêng của Playwright Utils như:
  - fixture composition
  - utility usage
  - network-first patterns
  - structured logging

### Workflow `ci`

Khi bật, TEA có thể sinh CI tốt hơn với:

- burn-in utility
- selective testing
- test prioritization theo thay đổi file

## Các utility hiện có

### `api-request`

HTTP client có type và hỗ trợ schema validation.

**Ưu điểm so với Playwright mặc định:**

- Tự parse JSON
- Trả về `{ status, body }`
- Retry tự động cho lỗi 5xx
- Có `.validateSchema()`

**Ví dụ:**

```typescript
import { test } from '@seontechnologies/playwright-utils/api-request/fixtures';
import { expect } from '@playwright/test';
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
});

test('should create user', async ({ apiRequest }) => {
  const { status, body } = await apiRequest({
    method: 'POST',
    path: '/api/users',
    body: { name: 'Test User', email: 'test@example.com' },
  }).validateSchema(UserSchema);

  expect(status).toBe(201);
  expect(body.id).toBeDefined();
});
```

### `auth-session`

Quản lý session xác thực với token persistence.

**Ưu điểm:**

- Xác thực một lần, dùng lại nhiều test
- Token được lưu xuống đĩa
- Hỗ trợ multi-user
- Tự renew token nếu hết hạn

**Ví dụ:**

```typescript
import { test } from '@seontechnologies/playwright-utils/auth-session/fixtures';
import { expect } from '@playwright/test';

test('should access protected route', async ({ page, authToken }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL('/dashboard');
});
```

### `network-recorder`

Ghi và phát lại lưu lượng mạng bằng HAR.

**Ví dụ chuyển chế độ:**

```bash
PW_NET_MODE=record npx playwright test
PW_NET_MODE=playback npx playwright test
```

**Lợi ích:**

- Offline testing
- Response deterministic
- Chạy nhanh hơn vì không phụ thuộc backend thật

### `intercept-network-call`

Spy hoặc stub request mạng và tự parse JSON.

**Ví dụ:**

```typescript
import { test } from '@seontechnologies/playwright-utils/fixtures';

test('should handle API errors', async ({ page, interceptNetworkCall }) => {
  const profileCall = interceptNetworkCall({
    method: 'GET',
    url: '**/api/profile',
    fulfillResponse: {
      status: 500,
      body: { error: 'Server error' },
    },
  });

  await page.goto('/profile');
  const { status, responseJson } = await profileCall;
  expect(status).toBe(500);
  expect(responseJson.error).toBe('Server error');
});
```

### `recurse`

Polling thông minh cho eventual consistency.

**Ví dụ:**

```typescript
const completed = await recurse(
  () => apiRequest({ method: 'GET', path: `/api/jobs/${job.id}` }),
  (result) => result.body.status === 'completed',
  { timeout: 30000, interval: 2000, log: 'Waiting for job to complete' },
);
```

### `log`

Structured logging tích hợp với Playwright report.

**Ví dụ:**

```typescript
import { log } from '@seontechnologies/playwright-utils';

await log.info('Starting login test');
await log.step('Navigated to login page');
await log.success('Login completed');
```

### `file-utils`

Đọc và validate CSV, PDF, XLSX, ZIP.

**Ví dụ CSV:**

```typescript
import { handleDownload, readCSV } from '@seontechnologies/playwright-utils/file-utils';

const downloadPath = await handleDownload({
  page,
  downloadDir: DOWNLOAD_DIR,
  trigger: () => page.click('button:has-text("Export")'),
});

const csvResult = await readCSV({ filePath: downloadPath });
```

### `burn-in`

Chọn test thông minh cho CI dựa trên git diff.

**Ví dụ script:**

```typescript
import { runBurnIn } from '@seontechnologies/playwright-utils/burn-in';

await runBurnIn({
  configPath: 'playwright.burn-in.config.ts',
  baseBranch: 'main',
});
```

### `network-error-monitor`

Tự động phát hiện HTTP 4xx/5xx trong lúc test.

**Ví dụ:**

```typescript
import { test } from '@seontechnologies/playwright-utils/network-error-monitor/fixtures';

test('should not have API errors', async ({ page }) => {
  await page.goto('/dashboard');
  await page.click('button');
});
```

Bạn có thể opt-out bằng annotation khi đang cố tình test luồng lỗi.

## Fixture composition

### Cách 1: Dùng combined fixtures của package

```typescript
import { test } from '@seontechnologies/playwright-utils/fixtures';
import { log } from '@seontechnologies/playwright-utils';
import { expect } from '@playwright/test';
```

### Cách 2: Tạo merged fixture riêng

**File 1: `support/merged-fixtures.ts`**

```typescript
import { test as base, mergeTests } from '@playwright/test';
import { test as apiRequest } from '@seontechnologies/playwright-utils/api-request/fixtures';
import { test as interceptNetworkCall } from '@seontechnologies/playwright-utils/intercept-network-call/fixtures';
import { test as networkErrorMonitor } from '@seontechnologies/playwright-utils/network-error-monitor/fixtures';
import { log } from '@seontechnologies/playwright-utils';

export const test = mergeTests(base, apiRequest, interceptNetworkCall, networkErrorMonitor);
export const expect = base.expect;
export { log };
```

**File 2: `tests/api/users.spec.ts`**

```typescript
import { test, expect, log } from '../support/merged-fixtures';
```

**So sánh:**

- Cách 1: nhanh, có sẵn mọi utility
- Cách 2: chọn đúng utility cần dùng, dễ kiểm soát hơn

## Khắc phục sự cố

### Lỗi import

```bash
npm list @seontechnologies/playwright-utils
npm install -D @seontechnologies/playwright-utils
```

### TEA không dùng utility này

Kiểm tra:

```bash
grep tea_use_playwright_utils _bmad/tea/config.yaml
```

Nếu vừa đổi config, hãy mở chat mới rồi chạy lại workflow.

### Type error với `apiRequest`

Nguyên nhân thường là chưa dùng schema validation.

**Cách xử lý:**

```typescript
import { z } from 'zod';

const ProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
});

const { status, body } = await apiRequest({
  method: 'GET',
  path: '/api/profile',
}).validateSchema(ProfileSchema);
```

## Tài liệu liên quan

### Getting Started

- [TEA Lite Quickstart Tutorial](/vi-vn/tutorials/tea-lite-quickstart.md)
- [How to Set Up Test Framework](/vi-vn/how-to/workflows/setup-test-framework.md)

### Workflow Guides

- [How to Run ATDD](/vi-vn/how-to/workflows/run-atdd.md)
- [How to Run Automate](/vi-vn/how-to/workflows/run-automate.md)
- [How to Run Test Review](/vi-vn/how-to/workflows/run-test-review.md)

### Other Customization

- [Configure Browser Automation](/vi-vn/how-to/customization/configure-browser-automation.md)

## Hiểu thêm về khái niệm

- [Testing as Engineering](/vi-vn/explanation/testing-as-engineering.md)
- [Fixture Architecture](/vi-vn/explanation/fixture-architecture.md)
- [Network-First Patterns](/vi-vn/explanation/network-first-patterns.md)
- [Test Quality Standards](/vi-vn/explanation/test-quality-standards.md)

## Tham chiếu

- [TEA Configuration](/vi-vn/reference/configuration.md)
- [Knowledge Base Index](/vi-vn/reference/knowledge-base.md)
- [Official PW-Utils Docs](https://seontechnologies.github.io/playwright-utils/)

---

Tạo bằng [BMad Method](https://bmad-method.org) - TEA (Test Engineering Architect)
