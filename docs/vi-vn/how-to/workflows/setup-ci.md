---
title: 'Cách thiết lập pipeline CI với TEA'
description: Cấu hình chạy test tự động với selective testing và burn-in loop bằng TEA
---

# Cách thiết lập pipeline CI với TEA

Sử dụng workflow `ci` của TEA để scaffold cấu hình CI/CD sẵn sàng cho production, phục vụ chạy test tự động với selective testing, sharding song song và phát hiện flaky test.

## Khi nào nên dùng

- Cần tự động hóa việc chạy test trong CI/CD
- Muốn selective testing, chỉ chạy các test bị ảnh hưởng
- Cần chạy song song để rút ngắn thời gian phản hồi
- Muốn dùng burn-in loop để phát hiện flaky test
- Đang thiết lập pipeline CI/CD mới
- Đang tối ưu workflow CI/CD hiện có

## Điều kiện tiên quyết

- Đã cài BMad Method
- Có sẵn agent TEA
- Đã cấu hình test framework, nên chạy `framework` trước
- Đã có test để đưa vào CI
- Có quyền truy cập nền tảng CI/CD như GitHub Actions, GitLab CI, v.v.

## Các bước thực hiện

### 1. Nạp TEA agent

Bắt đầu một cuộc chat mới và nạp TEA:

```text
tea
```

### 2. Chạy workflow CI

```text
ci
```

### 3. Chọn nền tảng CI/CD

TEA sẽ hỏi bạn đang dùng nền tảng nào.

**Các nền tảng được hỗ trợ:**

- **GitHub Actions** - phổ biến nhất
- **GitLab CI**
- **Jenkins** - sinh `Jenkinsfile` có stage song song, lưu artifact và xử lý sau lỗi
- **Azure DevOps** - sinh `azure-pipelines.yml` với matrix strategy cho sharding và cache đặc thù Azure
- **Harness** - sinh `.harness/pipeline.yaml` với execution dựa trên Kubernetes và các bước song song
- **Circle CI**
- **Other** - TEA cung cấp template tổng quát

**Ví dụ:**

```text
GitHub Actions
```

### 4. Cấu hình chiến lược chạy test

TEA sẽ hỏi về chiến lược thực thi test của bạn.

#### Cấu trúc repository

**Câu hỏi:** "What's your repository structure?"

**Các lựa chọn:**

- **Single app** - một ứng dụng ở thư mục gốc
- **Monorepo** - nhiều app hoặc package
- **Monorepo with affected detection** - chỉ test các package thay đổi

**Ví dụ:**

```text
Monorepo with multiple apps
Need selective testing for changed packages only
```

#### Chạy song song

**Câu hỏi:** "Want to shard tests for parallel execution?"

**Các lựa chọn:**

- **No sharding** - chạy tuần tự
- **Shard by workers** - chia qua N worker
- **Shard by file** - mỗi file chạy độc lập song song

**Ví dụ:**

```text
Yes, shard across 4 workers for faster execution
```

**Vì sao nên shard?**

- **4 workers:** suite 20 phút có thể giảm còn khoảng 5 phút
- **Dùng tài nguyên tốt hơn:** tận dụng runner hiệu quả
- **Phản hồi nhanh hơn:** developer phải chờ ít hơn

#### Burn-in loops

**Câu hỏi:** "Want burn-in loops for flakiness detection?"

**Các lựa chọn:**

- **No burn-in** - chỉ chạy một lần
- **PR burn-in** - chạy lặp nhiều lần trên pull request
- **Nightly burn-in** - có job riêng để phát hiện flaky test

**Ví dụ:**

```text
Yes, run tests 5 times on PRs to catch flaky tests early
```

**Vì sao nên burn-in?**

- Bắt flaky test trước khi merge
- Giảm lỗi CI ngắt quãng
- Tăng độ tin cậy của test suite

### 5. Rà soát cấu hình CI được sinh ra

TEA sẽ tạo file workflow theo từng nền tảng.

#### GitHub Actions (`.github/workflows/test.yml`)

```yaml
name: Test Suite

on:
  pull_request:
  push:
    branches: [main, develop]
  schedule:
    - cron: '0 2 * * *' # Nightly at 2 AM

jobs:
  test:
    name: Test (Shard ${{ matrix.shard }})
    runs-on: ubuntu-latest
    timeout-minutes: 15

    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3, 4]

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      - name: Run tests
        run: npx playwright test --shard=${{ matrix.shard }}/4

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-results-${{ matrix.shard }}
          path: test-results/
          retention-days: 7

      - name: Upload test report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report-${{ matrix.shard }}
          path: playwright-report/
          retention-days: 7

  burn-in:
    name: Burn-In (Flakiness Detection)
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    timeout-minutes: 30

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      - name: Run burn-in loop
        run: |
          for i in {1..5}; do
            echo "=== Burn-in iteration $i/5 ==="
            npx playwright test --grep-invert "@skip" || exit 1
          done

      - name: Upload burn-in results
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: burn-in-failures
          path: test-results/

  selective:
    name: Selective Tests
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'

    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      - name: Run selective tests
        run: npm run test:changed
```

#### GitLab CI (`.gitlab-ci.yml`)

```yaml
variables:
  NODE_VERSION: '18'

stages:
  - test
  - burn-in

test:
  stage: test
  image: node:$NODE_VERSION
  parallel: 4
  script:
    - npm ci
    - npx playwright install --with-deps
    - npx playwright test --shard=$CI_NODE_INDEX/$CI_NODE_TOTAL
  artifacts:
    when: always
    paths:
      - test-results/
      - playwright-report/
    expire_in: 7 days
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

burn-in:
  stage: burn-in
  image: node:$NODE_VERSION
  script:
    - npm ci
    - npx playwright install --with-deps
    - |
      for i in {1..5}; do
        echo "=== Burn-in iteration $i/5 ==="
        npx playwright test || exit 1
      done
  artifacts:
    when: on_failure
    paths:
      - test-results/
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
```

#### Burn-in testing

**Lựa chọn 1: Burn-in cổ điển, dùng sẵn của Playwright**

```json
{
  "scripts": {
    "test": "playwright test",
    "test:burn-in": "playwright test --repeat-each=5 --retries=0"
  }
}
```

**Cách hoạt động:**

- Chạy mọi test 5 lần
- Fail nếu có bất kỳ vòng lặp nào fail
- Phát hiện flakiness trước khi merge

**Nên dùng khi:** suite còn nhỏ, muốn lặp lại toàn bộ

---

**Lựa chọn 2: Burn-in thông minh, dùng Playwright Utils**

Nếu `tea_use_playwright_utils: true`:

**`scripts/burn-in-changed.ts`:**

```typescript
import { runBurnIn } from '@seontechnologies/playwright-utils/burn-in';

await runBurnIn({
  configPath: 'playwright.burn-in.config.ts',
  baseBranch: 'main',
});
```

**`playwright.burn-in.config.ts`:**

```typescript
import type { BurnInConfig } from '@seontechnologies/playwright-utils/burn-in';

const config: BurnInConfig = {
  skipBurnInPatterns: ['**/config/**', '**/*.md', '**/*types*'],
  burnInTestPercentage: 0.3,
  burnIn: { repeatEach: 5, retries: 0 },
};

export default config;
```

**`package.json`:**

```json
{
  "scripts": {
    "test:burn-in": "tsx scripts/burn-in-changed.ts"
  }
}
```

**Cách hoạt động:**

- Phân tích `git diff`, chỉ lấy test bị ảnh hưởng
- Lọc thông minh, bỏ qua config, docs, types
- Giới hạn khối lượng chạy, ví dụ 30% số test bị ảnh hưởng
- Mỗi test vẫn chạy 5 lần

**Nên dùng khi:** suite lớn, muốn chọn lọc thông minh hơn

---

**So sánh:**

| Tính năng       | Burn-In cổ điển                       | Burn-In thông minh (PW-Utils)          |
| --------------- | ------------------------------------- | -------------------------------------- |
| Thay đổi 1 file | Chạy toàn bộ 500 test x 5 = 2500 lượt | Chạy 3 test bị ảnh hưởng x 5 = 15 lượt |
| Thay đổi config | Chạy toàn bộ                          | Bỏ qua, không có test bị ảnh hưởng     |
| Thay đổi type   | Chạy toàn bộ                          | Bỏ qua, không ảnh hưởng runtime        |
| Thiết lập       | Gần như không cần config              | Cần thêm file config                   |

**Khuyến nghị:** bắt đầu với cách cổ điển cho đơn giản, sau đó nâng sang Smart Burn-In khi suite tăng trưởng.

### 6. Cấu hình secrets

TEA sẽ cung cấp checklist secrets.

**Secrets bắt buộc** cần thêm vào nền tảng CI/CD:

```markdown
## GitHub Actions Secrets

Repository Settings → Secrets and variables → Actions

### Required

- None (tests run without external auth)

### Optional

- `TEST_USER_EMAIL` - thông tin đăng nhập user test
- `TEST_USER_PASSWORD` - mật khẩu user test
- `API_BASE_URL` - endpoint API cho test
- `DATABASE_URL` - database test nếu cần
```

**Cách thêm secrets:**

**GitHub Actions:**

1. Vào `Settings → Secrets → Actions`
2. Chọn `New repository secret`
3. Thêm tên và giá trị
4. Dùng trong workflow: `${{ secrets.TEST_USER_EMAIL }}`

**GitLab CI:**

1. Vào `Project Settings → CI/CD → Variables`
2. Thêm tên biến và giá trị
3. Dùng trong workflow: `$TEST_USER_EMAIL`

### 7. Kiểm tra pipeline CI

#### Push và xác minh

**Commit file workflow:**

```bash
git add .github/workflows/test.yml
git commit -m "ci: add automated test pipeline"
git push
```

**Quan sát lượt chạy CI:**

- GitHub Actions: tab `Actions`
- GitLab CI: `CI/CD → Pipelines`
- Circle CI: `Pipelines`

**Kết quả mong đợi:**

```text
✓ test (shard 1/4) - 3m 24s
✓ test (shard 2/4) - 3m 18s
✓ test (shard 3/4) - 3m 31s
✓ test (shard 4/4) - 3m 15s
✓ burn-in - 15m 42s
```

#### Kiểm tra bằng pull request

**Tạo PR thử nghiệm:**

```bash
git checkout -b test-ci-setup
echo "# Test" > test.md
git add test.md
git commit -m "test: verify CI setup"
git push -u origin test-ci-setup
```

**Mở PR và xác minh:**

- Test chạy tự động
- Burn-in chạy nếu được cấu hình cho PR
- Selective tests chạy nếu đã bật
- Tất cả check pass

## Bạn sẽ nhận được gì

### Chạy test tự động

- **Mỗi pull request** - bắt lỗi trước khi merge
- **Mỗi lần push lên main** - bảo vệ production
- **Nightly** - regression toàn diện

### Chạy song song

- **Phản hồi nhanh hơn nhiều** - shard qua nhiều worker
- **Tận dụng runner tốt hơn** - tăng hiệu quả tài nguyên CI

### Selective testing

- **Chỉ chạy test bị ảnh hưởng** - chọn theo `git diff`
- **PR feedback nhanh hơn** - không phải chạy toàn bộ suite mỗi lần

### Phát hiện flakiness

- **Burn-in loops** - chạy đi chạy lại nhiều lần
- **Phát hiện sớm** - bắt flaky test ngay trên PR
- **Tăng niềm tin** - xác nhận suite đáng tin cậy

### Thu thập artifact

- **Test results** - lưu giữ trong 7 ngày
- **Screenshots** - thu thập khi test fail
- **Videos** - bản ghi toàn bộ test
- **Traces** - file trace của Playwright để debug

## Mẹo thực hành

### Bắt đầu đơn giản, rồi tăng dần

**Tuần 1:** pipeline cơ bản

```yaml
- Run tests on PR
- Single worker (no sharding)
```

**Tuần 2:** thêm chạy song song

```yaml
- Shard across 4 workers
- Faster feedback
```

**Tuần 3:** thêm selective testing

```yaml
- Git diff-based selection
- Skip unaffected tests
```

**Tuần 4:** thêm burn-in

```yaml
- Detect flaky tests
- Run on PR and nightly
```

### Tối ưu cho tốc độ phản hồi

**Mục tiêu:** phản hồi PR dưới 5 phút

**Chiến lược:**

- Shard test qua nhiều worker
- Dùng selective testing, chỉ chạy 20% test bị ảnh hưởng thay vì 100%
- Cache dependency với `actions/cache`, `cache: 'npm'`
- Chạy smoke test trước, full suite sau

**Ví dụ workflow nhanh:**

```yaml
jobs:
  smoke:
    run: npm run test:smoke

  full:
    needs: smoke
    run: npm test
```

### Dùng tag cho test

Gắn tag để phục vụ chạy chọn lọc:

```typescript
test('@critical should login', async ({ page }) => {});
test('@smoke should load homepage', async ({ page }) => {});
test('@slow should process large file', async ({ page }) => {});
test('@local-only should use local service', async ({ page }) => {});
```

**Trong CI:**

```bash
# PR: chỉ chạy critical và smoke
npx playwright test --grep "@critical|@smoke"

# Nightly: chạy tất cả trừ local-only
npx playwright test --grep-invert "@local-only"
```

### Theo dõi hiệu năng CI

```markdown
## CI Metrics

| Metric           | Target   | Current | Status |
| ---------------- | -------- | ------- | ------ |
| PR feedback time | < 5 min  | 3m 24s  | ✅     |
| Full suite time  | < 15 min | 12m 18s | ✅     |
| Flakiness rate   | < 1%     | 0.3%    | ✅     |
| CI cost/month    | < $100   | $75     | ✅     |
```

### Xử lý flaky test

Khi burn-in phát hiện flakiness:

1. **Quarantine flaky test**

```typescript
test.skip('flaky test - investigating', async ({ page }) => {
  // TODO: Fix flakiness
});
```

2. **Điều tra bằng trace viewer**

```bash
npx playwright show-trace test-results/trace.zip
```

3. **Sửa nguyên nhân gốc**

- Thêm network-first patterns
- Loại bỏ hard wait
- Sửa race condition

4. **Xác minh lại**

```bash
npm run test:burn-in -- tests/flaky.spec.ts --repeat 20
```

### Bảo mật secrets

**Không commit secrets vào source:**

```yaml
# ❌ Bad
- run: API_KEY=sk-1234... npm test

# ✅ Good
- run: npm test
  env:
    API_KEY: ${{ secrets.API_KEY }}
```

**Dùng secret theo từng môi trường:**

- `STAGING_API_URL`
- `PROD_API_URL`
- `TEST_API_URL`

### Cache mạnh tay khi hợp lý

```yaml
- uses: actions/setup-node@v4
  with:
    cache: 'npm'

- name: Cache Playwright browsers
  uses: actions/cache@v4
  with:
    path: ~/.cache/ms-playwright
    key: playwright-${{ hashFiles('package-lock.json') }}
```

## Sự cố thường gặp

### Test pass local nhưng fail trong CI

**Triệu chứng:**

- Local xanh nhưng CI đỏ
- "Works on my machine"

**Nguyên nhân phổ biến:**

- Khác phiên bản Node
- Khác phiên bản browser
- Thiếu biến môi trường
- Khác múi giờ
- Race condition, CI chậm hơn local

**Cách xử lý:**

```yaml
- uses: actions/setup-node@v4
  with:
    node-version-file: '.nvmrc'

- run: npx playwright install --with-deps chromium@1.40.0

  env:
    TZ: 'America/New_York'
```

### CI chạy quá lâu

**Vấn đề:** CI mất hơn 30 phút, developer chờ quá lâu.

**Cách xử lý:**

1. Shard test
2. Dùng selective testing cho PR
3. Chạy smoke trước, full suite sau
4. Cache dependencies
5. Tối ưu test, bỏ hard wait và giảm test chậm

### Burn-in lúc nào cũng fail

**Vấn đề:** job burn-in lần nào cũng fail.

**Nguyên nhân:** suite đang flaky.

**Cách xử lý:**

1. Xác định test nào flaky
2. Sửa bằng `test-review`
3. Chạy burn-in riêng trên file nghi vấn:

```bash
npm run test:burn-in tests/flaky.spec.ts
```

### Hết quota CI minutes

**Vấn đề:** tốn quá nhiều CI minutes, chạm giới hạn gói.

**Cách xử lý:**

1. Chỉ chạy full suite trên nhánh chính
2. Dùng selective testing cho PR
3. Chạy suite đắt đỏ vào nightly
4. Dùng self-hosted runner nếu phù hợp

## Tài liệu liên quan

- [Cách thiết lập test framework](/docs/vi-vn/how-to/workflows/setup-test-framework.md) - nên làm trước
- [Cách chạy test-review](/docs/vi-vn/how-to/workflows/run-test-review.md) - audit test trong CI
- [Tích hợp Playwright Utils](/docs/vi-vn/how-to/customization/integrate-playwright-utils.md) - công cụ burn-in và tiện ích hỗ trợ

## Hiểu thêm về khái niệm

- [Tiêu chuẩn chất lượng test](/docs/vi-vn/explanation/test-quality-standards.md) - vì sao determinism quan trọng
- [Network-first patterns](/docs/vi-vn/explanation/network-first-patterns.md) - tránh flaky trong CI

## Tham chiếu

- [Lệnh `*ci`](/docs/vi-vn/reference/commands.md#ci) - tham chiếu đầy đủ về command
- [Cấu hình TEA](/docs/vi-vn/reference/configuration.md) - các option liên quan tới CI

---

Được tạo bằng [BMad Method](https://bmad-method.org) - TEA (Test Engineering Architect)
