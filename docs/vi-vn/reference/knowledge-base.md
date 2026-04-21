---
title: 'Chỉ mục Knowledge Base của TEA'
description: Chỉ mục đầy đủ của 42 knowledge fragment mà TEA dùng cho context engineering
---

# Chỉ mục Knowledge Base của TEA

TEA sử dụng 42 knowledge fragment chuyên biệt cho context engineering. Các fragment này được nạp động theo nhu cầu của workflow thông qua manifest `tea-index.csv`.

## Context Engineering là gì?

**Context engineering** là cách đưa các tiêu chuẩn chuyên biệt của domain vào context AI một cách có hệ thống, thay vì chỉ dựa vào prompt.

Thay vì luôn phải nhắc AI “hãy viết test tốt”, TEA sẽ:

1. Đọc `tea-index.csv` để biết fragment nào liên quan đến workflow hiện tại
2. Chỉ nạp fragment cần thiết để giữ context tập trung
3. Vận hành theo tiêu chuẩn kiểm thử chuyên biệt thay vì tri thức chung chung
4. Tạo ra test và artifact nhất quán, sẵn sàng cho production

**Ví dụ:**

```text
User runs: test-design

TEA reads tea-index.csv:
- Loads: test-quality.md, test-priorities-matrix.md, risk-governance.md
- Skips: network-recorder.md, burn-in.md
```

## Cách knowledge loading hoạt động

### 1. Workflow được kích hoạt

Người dùng chạy workflow, ví dụ `test-design`.

### 2. Tra manifest

TEA đọc file:

`src/agents/bmad-tea/resources/tea-index.csv`

Ví dụ:

```csv
id,name,description,tags,tier,fragment_file
test-quality,Test Quality,Execution limits and isolation rules,"quality,standards",core,knowledge/test-quality.md
risk-governance,Risk Governance,Risk scoring and gate decisions,"risk,governance",core,knowledge/risk-governance.md
```

### 3. Nạp fragment động

Chỉ fragment cần cho workflow được đưa vào context.

### 4. Tạo đầu ra nhất quán

AI hoạt động theo pattern đã được chuẩn hóa, nên đầu ra ổn định hơn nhiều.

## Nhóm fragment

### Architecture & Fixtures

Pattern hạ tầng kiểm thử và fixture composition.

- `fixture-architecture` - Pure function → Fixture → mergeTests
- `network-first` - intercept-before-navigate, HAR capture, deterministic wait
- `playwright-config` - môi trường, timeout, artifact
- `fixtures-composition` - mergeTests và tổ chức fixture

**Dùng trong:** `framework`, `test-design`, `atdd`, `automate`, `test-review`

### Data & Setup

- `data-factories` - factory pattern, faker, cleanup
- `email-auth` - magic link, email flow
- `auth-session` - token persistence, multi-user, auth pattern

**Dùng trong:** `framework`, `atdd`, `automate`, `test-review`

### Network & Reliability

- `network-recorder` - HAR record/playback
- `intercept-network-call` - network spy/stub, parse JSON
- `error-handling` - retry validation, scoped exception handling
- `network-error-monitor` - phát hiện HTTP 4xx/5xx

**Dùng trong:** `atdd`, `automate`, `test-review`

### Test Execution & CI

- `ci-burn-in`
- `burn-in`
- `selective-testing`

**Dùng trong:** `ci`, `test-review`

### Quality & Standards

- `test-quality`
- `test-levels-framework`
- `test-priorities-matrix`
- `test-healing-patterns`
- `component-tdd`

**Dùng trong:** `test-design`, `atdd`, `automate`, `test-review`, `trace`

### Risk & Gates

- `risk-governance`
- `probability-impact`
- `nfr-criteria`
- `adr-quality-readiness-checklist`

**Dùng trong:** `test-design`, `nfr-assess`, `trace`

### Selectors & Timing

- `selector-resilience`
- `timing-debugging`
- `visual-debugging`

**Dùng trong:** `atdd`, `automate`, `test-review`

### Feature Flags & API Patterns

- `feature-flags`
- `api-testing-patterns`

**Dùng trong:** `test-design`, `atdd`, `automate`

### Pact & Contract Testing Integration

Nhóm fragment cho contract testing và tích hợp Pact:

- `contract-testing`
- `pactjs-utils-overview`
- `pactjs-utils-consumer-helpers`
- `pactjs-utils-provider-verifier`
- `pactjs-utils-request-filter`
- `pact-mcp`
- `pact-consumer-framework-setup`
- `pact-consumer-di`

**Dùng trong:** `framework`, `test-design`, `atdd`, `automate`, `test-review`, `ci`

### Browser Automation

- `playwright-cli` - automation qua CLI cho agent

**Dùng trong:** `atdd`, `automate`, `test-design`, `test-review`, `nfr-assess`

### Playwright Utils Integration

Pattern dùng `@seontechnologies/playwright-utils`:

- `api-request`
- `auth-session`
- `network-recorder`
- `intercept-network-call`
- `recurse`
- `log`
- `file-utils`
- `burn-in`
- `network-error-monitor`
- `overview`

**Dùng trong:** `framework`, `atdd`, `automate`, `test-review`, `ci`

## Manifest fragment (`tea-index.csv`)

**Vị trí:** `src/agents/bmad-tea/resources/tea-index.csv`

**Mục đích:** Theo dõi tất cả fragment và workflow nào sử dụng chúng.

**Cột dữ liệu:**

- `id` - định danh duy nhất
- `name` - tên dễ đọc
- `description` - fragment bao phủ nội dung gì
- `tags` - tag hỗ trợ tìm kiếm
- `tier` - mức ưu tiên khi nạp
- `fragment_file` - đường dẫn tương đối tới file markdown

### Loading profile

- **Core tier**: nạp tự động khi workflow bắt đầu
- **Extended tier**: nạp khi ngữ cảnh yêu cầu
- **Specialized tier**: chỉ nạp khi use case thật sự khớp

## Workflow nào nạp fragment nào

### `framework`

Fragment chính:

- `fixture-architecture.md`
- `playwright-config.md`
- `fixtures-composition.md`

### `test-design`

Fragment chính:

- `test-quality.md`
- `test-priorities-matrix.md`
- `test-levels-framework.md`
- `risk-governance.md`
- `probability-impact.md`

### `atdd`

Fragment chính:

- `test-quality.md`
- `component-tdd.md`
- `fixture-architecture.md`
- `network-first.md`
- `data-factories.md`
- `selector-resilience.md`
- `timing-debugging.md`
- `test-healing-patterns.md`

### `automate`

Fragment chính:

- `test-quality.md`
- `test-levels-framework.md`
- `test-priorities-matrix.md`
- `fixture-architecture.md`
- `network-first.md`
- `selector-resilience.md`
- `test-healing-patterns.md`
- `timing-debugging.md`

### `test-review`

Fragment chính:

- `test-quality.md`
- `test-healing-patterns.md`
- `selector-resilience.md`
- `timing-debugging.md`
- `visual-debugging.md`
- `network-first.md`
- `test-levels-framework.md`
- `fixture-architecture.md`

### `ci`

Fragment chính:

- `ci-burn-in.md`
- `burn-in.md`
- `selective-testing.md`
- `playwright-config.md`

### `nfr-assess`

Fragment chính:

- `nfr-criteria.md`
- `risk-governance.md`
- `probability-impact.md`

### `trace`

Fragment chính:

- `test-priorities-matrix.md`
- `risk-governance.md`
- `test-quality.md`

Nếu gate decision có xét NFR thì `nfr-criteria.md` cũng sẽ được nạp.

## Tài liệu liên quan

- [TEA Overview](/vi-vn/explanation/tea-overview.md)
- [Testing as Engineering](/vi-vn/explanation/testing-as-engineering.md)
- [TEA Command Reference](/vi-vn/reference/commands.md)

---

Tạo bằng [BMad Method](https://bmad-method.org) - TEA (Test Engineering Architect)
