---
title: 'Cách thiết lập test framework với TEA'
description: Cách dựng một test framework sẵn sàng cho production bằng TEA
---

Sử dụng workflow `framework` của TEA để scaffold một test framework sẵn sàng cho production cho dự án của bạn.

## Khi nào nên dùng

- Dự án chưa có test framework
- Bộ test hiện tại chưa đủ production-ready
- Dự án mới cần hạ tầng kiểm thử rõ ràng
- Đang ở Phase 3 sau khi architecture cơ bản đã rõ

:::note[Điều kiện tiên quyết]

- Đã cài BMad Method
- Architecture đã hoàn tất, hoặc ít nhất tech stack đã được chốt
- Có TEA agent
  :::

## Các bước thực hiện

### 1. Nạp TEA agent

Bắt đầu một chat mới và nạp TEA.

### 2. Chạy workflow framework

```text
framework
```

### 3. Trả lời các câu hỏi của TEA

TEA sẽ hỏi về:

- tech stack của bạn như React, Node, Python, Java, v.v.
- test framework mong muốn:
  - **Frontend/Fullstack:** Playwright, Cypress
  - **Backend (Node.js):** Jest, Vitest hoặc Playwright cho API testing
  - **Backend (Python):** pytest hoặc Playwright for Python
  - **Backend (Java/Kotlin):** JUnit hoặc Playwright for Java
  - **Backend (Go):** Go test
  - **Backend (.NET):** dotnet test / xUnit hoặc Playwright for .NET
  - **Backend (Ruby):** RSpec
- phạm vi test như E2E, integration, unit, API
- nền tảng CI/CD như GitHub Actions, GitLab CI, Jenkins, Azure DevOps, Harness

### 4. Review output được sinh ra

TEA thường tạo:

- **Test scaffold** - cấu trúc thư mục và file config phù hợp ngôn ngữ
- **Sample specs** - test mẫu theo best practice của framework đã chọn
- **`.env.example`** - template biến môi trường
- **Version file** - như `.nvmrc`, `.python-version`, `global.json`
- **README updates** - tài liệu cách chạy test

## Bạn sẽ nhận được gì

**Frontend/Fullstack (Node.js):**

```text
tests/
├── e2e/
│   ├── example.spec.ts
│   └── fixtures/
├── integration/
├── unit/
├── playwright.config.ts
└── README.md
```

**Backend (ví dụ Python):**

```text
tests/
├── unit/
│   └── test_example.py
├── integration/
├── api/
├── conftest.py
└── README.md
```

> **Lưu ý:** Playwright có binding chính thức cho Python, Java và .NET, nên không chỉ giới hạn ở Node.js.

## Tùy chọn: tích hợp Playwright Utils

TEA có thể tích hợp `@seontechnologies/playwright-utils` để cung cấp fixture nâng cao:

```bash
npm install -D @seontechnologies/playwright-utils
```

Bạn có thể bật trong lúc cài BMad hoặc đặt `tea_use_playwright_utils: true` trong config.

**Một số utility có sẵn:** `api-request`, `network-recorder`, `auth-session`, `intercept-network-call`, `recurse`, `log`, `file-utils`, `burn-in`, `network-error-monitor`

## Tùy chọn: MCP enhancements

TEA có thể dùng Playwright MCP servers cho các capability mạnh hơn:

- `playwright` - browser automation
- `playwright-test` - test runner với failure analysis

Cấu hình ở phần MCP settings của IDE hoặc môi trường bạn đang dùng.

## Mẹo thực hành

- **Thường chỉ chạy một lần mỗi repository**
- **Nên chạy sau khi architecture rõ**
- **Nên nối tiếp bằng `ci`** để đưa framework vào pipeline
- Nếu là dự án lớn, nên rà sớm fixture strategy thay vì để về sau

## Checklist cho QC

- Có tách test theo tầng hoặc theo loại rõ ràng không
- Có fixture nền tảng cho auth, seed dữ liệu, API client hay không
- Có convention rõ cho tên file và cấu trúc thư mục không
- Có cấu hình môi trường test rõ ràng không
- Có sample test đủ làm chuẩn cho các file về sau không

## Bước tiếp theo

Sau khi thiết lập xong test framework:

1. **Test Design** - tạo test plan cho hệ thống hoặc từng epic
2. **CI Configuration** - cấu hình chạy test tự động
3. **Story Implementation** - lúc này hạ tầng test đã sẵn sàng để DEV/QC dùng

## Tài liệu liên quan

- [Setup CI Pipeline](/docs/vi-vn/how-to/workflows/setup-ci.md)
- [Run Test Design](/docs/vi-vn/how-to/workflows/run-test-design.md)
- [Integrate Playwright Utils](/docs/vi-vn/how-to/customization/integrate-playwright-utils.md)
- [TEA Overview](/docs/vi-vn/explanation/tea-overview.md)

---

Được tạo bằng [BMad Method](https://bmad-method.org) - TEA (Test Engineering Architect)
