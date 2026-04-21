---
title: 'Tham chiếu cấu hình TEA'
description: Tài liệu tham chiếu đầy đủ cho các tùy chọn cấu hình và vị trí file cấu hình của TEA
---

# Tham chiếu cấu hình TEA

Tài liệu tham chiếu đầy đủ cho toàn bộ tùy chọn cấu hình của TEA (Test Engineering Architect).

## Vị trí các file cấu hình

### Cấu hình người dùng (do installer tạo)

**Vị trí:** `_bmad/tea/config.yaml`

**Mục đích:** Lưu các giá trị cấu hình riêng cho repository của bạn

**Được tạo bởi:** BMad installer

**Trạng thái:** Thường được thêm vào `.gitignore` vì chứa giá trị riêng của từng người dùng

**Cách dùng:** Chỉnh sửa file này để thay đổi hành vi của TEA trong dự án

**Ví dụ:**

```yaml
# _bmad/tea/config.yaml
project_name: my-awesome-app
user_skill_level: intermediate
output_folder: _bmad-output
test_artifacts: _bmad-output/test-artifacts
tea_use_playwright_utils: true
tea_use_pactjs_utils: false
tea_pact_mcp: 'none'
tea_browser_automation: 'auto'
tea_execution_mode: 'auto'
tea_capability_probe: true
```

### Schema chuẩn (nguồn định nghĩa chính thức)

**Vị trí:** `src/module.yaml`

**Mục đích:** Định nghĩa các khóa cấu hình có sẵn, giá trị mặc định và câu hỏi mà installer sẽ hiển thị

**Được tạo bởi:** Các maintainer của BMAD

**Trạng thái:** Được quản lý phiên bản trong repository BMAD

**Cách dùng:** Chỉ tham chiếu, không chỉnh sửa trừ khi bạn đang đóng góp trực tiếp vào BMAD

**Lưu ý:** Installer sẽ đọc `module.yaml` để hỏi người dùng về các giá trị cấu hình, sau đó ghi lựa chọn vào `_bmad/tea/config.yaml` trong dự án của bạn.

---

## Các tùy chọn cấu hình của TEA

### test_artifacts

Thư mục đầu ra gốc dành cho các artifact do TEA tạo ra, ví dụ test design, report, traceability, v.v.

**Vị trí schema:** `src/module.yaml` (cấu hình module TEA)

**Cấu hình người dùng:** `_bmad/tea/config.yaml`

**Kiểu:** `string`

**Mặc định:** `{output_folder}/test-artifacts`

**Mục đích:** Cho phép artifact của TEA nằm ngoài thư mục output cốt lõi của BMM nếu cần.

**Ví dụ:**

```yaml
test_artifacts: docs/testing-artifacts
```

### tea_use_playwright_utils

Bật tích hợp Playwright Utils để dùng fixture và utility sẵn sàng cho production.

**Vị trí schema:** `src/module.yaml` (cấu hình module TEA)

**Cấu hình người dùng:** `_bmad/tea/config.yaml`

**Kiểu:** `boolean`

**Mặc định:** `true`

**Câu hỏi từ installer:**

```text
Enable Playwright Utils integration?
```

**Mục đích:** Cho phép TEA:

- Đưa `playwright-utils` vào scaffold do `framework` tạo ra
- Sinh test dùng fixture của `playwright-utils`
- Review test theo các pattern của `playwright-utils`
- Cấu hình CI với burn-in và selective testing utility

**Ảnh hưởng tới workflow:**

- `framework` - thêm import `playwright-utils` và ví dụ fixture
- `atdd` - dùng các fixture như `apiRequest`, `authSession` trong test được tạo
- `automate` - tận dụng utility cho pattern test
- `test-review` - review test theo best practice của `playwright-utils`
- `ci` - thêm burn-in utility và selective testing

**Ví dụ (bật):**

```yaml
tea_use_playwright_utils: true
```

**Ví dụ (tắt):**

```yaml
tea_use_playwright_utils: false
```

**Điều kiện tiên quyết:**

```bash
npm install -D @seontechnologies/playwright-utils
```

**Liên quan:**

- [Hướng dẫn tích hợp Playwright Utils](/vi-vn/how-to/customization/integrate-playwright-utils.md)
- [Playwright Utils trên npm](https://www.npmjs.com/package/@seontechnologies/playwright-utils)

---

### tea_use_pactjs_utils

Bật tích hợp Pact.js Utils để hỗ trợ consumer-driven contract testing ở mức sẵn sàng cho production.

**Vị trí schema:** `src/module.yaml` (cấu hình module TEA)

**Cấu hình người dùng:** `_bmad/tea/config.yaml`

**Kiểu:** `boolean`

**Mặc định:** `false`

**Câu hỏi từ installer:**

```text
Enable Pact.js Utils for consumer-driven contract testing?
```

**Mục đích:** Cho phép TEA:

- Nạp các knowledge fragment của Pact.js Utils trong lúc load context
- Tạo scaffold contract test và ví dụ trong `framework`
- Sinh hướng dẫn contract testing trong `atdd` và `automate`
- Review pattern provider verification trong `test-review`
- Thêm stage contract pipeline và gate trong `ci`

**Ảnh hưởng tới workflow:**

- `framework` - tạo thư mục pact test và sample pattern của pactjs-utils
- `atdd` - nạp fragment của pactjs-utils để hỗ trợ ngữ cảnh sinh test
- `automate` - nạp fragment của pactjs-utils và truyền cấu hình pact cho subagent
- `test-design` - nạp fragment của pactjs-utils cho planning mức hệ thống/epic
- `test-review` - dùng pattern provider/review của pactjs-utils
- `ci` - thêm stage contract-test và quality gate

**Dùng khi nào:** Đội của bạn đã dùng consumer-driven contract testing hoặc muốn TEA chủ động scaffold pattern liên quan tới Pact. Nếu dự án không dùng Pact thì nên để tắt.

**Ví dụ (bật):**

```yaml
tea_use_pactjs_utils: true
```

**Ví dụ (tắt):**

```yaml
tea_use_pactjs_utils: false
```

**Điều kiện tiên quyết:**

```bash
npm install -D @seontechnologies/pactjs-utils @pact-foundation/pact
```

**Liên quan:**

- [Tài liệu Pact.js Utils](https://seontechnologies.github.io/pactjs-utils/)
- [TEA Overview - Tích hợp tùy chọn](/vi-vn/explanation/tea-overview.md)

---

### tea_pact_mcp

Chiến lược dùng Pact MCP để tương tác với broker trong các workflow contract testing.

**Vị trí schema:** `src/module.yaml` (cấu hình module TEA)

**Cấu hình người dùng:** `_bmad/tea/config.yaml`

**Kiểu:** `string`

**Mặc định:** `"none"`

**Tùy chọn:** `"mcp"` | `"none"`

**Câu hỏi từ installer:**

```text
Enable SmartBear MCP for PactFlow/Pact Broker? Only needed if you already use a broker.
```

**Mục đích:** Quy định TEA có được phép dùng SmartBear MCP tool cho các việc như:

- Khám phá provider-state trong workflow design/generation
- Hỗ trợ review Pact test
- Hướng dẫn can-i-deploy và matrix trong workflow CI

**Ảnh hưởng tới workflow:**

- `test-design` - nạp ngữ cảnh contract có broker
- `automate` - hỗ trợ ngữ cảnh sinh pact với broker
- `test-review` - hỗ trợ review pact với MCP
- `ci` - tham chiếu can-i-deploy/matrix với MCP

**Dùng khi nào:** Khi dự án đang dùng PactFlow hoặc Pact Broker và bạn muốn TEA truy vấn trạng thái broker trong lúc review, sinh test hoặc hỗ trợ gate. Nếu không, hãy để `none`.

**Điều kiện tiên quyết:**

```bash
npm install -g @smartbear/mcp
# hoặc: npx -y @smartbear/mcp@latest
```

**Biến môi trường bắt buộc cho broker (khi dùng tính năng Pact):**

- `PACT_BROKER_BASE_URL`
- `PACT_BROKER_TOKEN` (hoặc username/password nếu dùng basic auth)

**Ví dụ (bật MCP):**

```yaml
tea_pact_mcp: 'mcp'
```

**Ví dụ (tắt MCP):**

```yaml
tea_pact_mcp: 'none'
```

**Liên quan:**

- [Hướng dẫn cấu hình Browser Automation](/vi-vn/how-to/customization/configure-browser-automation.md)
- [Tài liệu SmartBear MCP](https://developer.smartbear.com/smartbear-mcp/docs/getting-started)

---

### tea_browser_automation

Chiến lược browser automation cho các workflow của TEA. Thiết lập này kiểm soát cách TEA tương tác với browser thật trong lúc tạo hoặc đánh giá test.

**Vị trí schema:** `src/module.yaml` (cấu hình module TEA)

**Cấu hình người dùng:** `_bmad/tea/config.yaml`

**Kiểu:** `string`

**Mặc định:** `"auto"`

**Tùy chọn:** `"auto"` | `"cli"` | `"mcp"` | `"none"`

**Câu hỏi từ installer:**

```text
How should TEA interact with browsers during test generation?
```

**Mục đích:** Chọn công cụ browser automation TEA sẽ dùng:

| Chế độ | Hành vi                                                                                                              |
| ------ | -------------------------------------------------------------------------------------------------------------------- |
| `auto` | Chọn thông minh - CLI cho tác vụ stateless, MCP cho luồng cần giữ trạng thái. Có fallback an toàn. **(Khuyến nghị)** |
| `cli`  | Chỉ dùng CLI (`@playwright/cli`). Bỏ qua MCP.                                                                        |
| `mcp`  | Chỉ dùng MCP. Bỏ qua CLI. Tương đương hành vi cũ của `tea_use_mcp_enhancements: true`.                               |
| `none` | Không tương tác với browser. Chỉ sinh bằng AI từ docs/code.                                                          |

**Ảnh hưởng tới workflow:**

- `test-design` - exploratory mode
- `atdd` - recording mode
- `automate` - healing mode và recording mode
- `test-review` - thu thập bằng chứng như trace, screenshot

**Điều kiện tiên quyết:**

- **CLI:** `npm install -g @playwright/cli@latest` rồi `playwright-cli install --skills`
- **MCP:** cấu hình MCP server trong IDE, xem [Configure Browser Automation](/vi-vn/how-to/customization/configure-browser-automation.md)

**Ví dụ (auto - khuyến nghị):**

```yaml
tea_browser_automation: 'auto'
```

**Ví dụ (chỉ CLI):**

```yaml
tea_browser_automation: 'cli'
```

**Ví dụ (chỉ MCP - giống hành vi cũ):**

```yaml
tea_browser_automation: 'mcp'
```

**Ví dụ (tắt):**

```yaml
tea_browser_automation: 'none'
```

**Chuyển đổi từ cờ cũ:**

| Thiết lập cũ                      | Tương đương mới                  |
| --------------------------------- | -------------------------------- |
| `tea_use_mcp_enhancements: true`  | `tea_browser_automation: "auto"` |
| `tea_use_mcp_enhancements: false` | `tea_browser_automation: "none"` |

---

### tea_execution_mode

Chiến lược thực thi cho các workflow TEA có khả năng orchestration.

**Vị trí schema:** `src/module.yaml` (cấu hình module TEA)

**Cấu hình người dùng:** `_bmad/tea/config.yaml`

**Kiểu:** `string`

**Mặc định:** `"auto"`

**Tùy chọn:** `"auto"` | `"subagent"` | `"agent-team"` | `"sequential"`

**Câu hỏi từ installer:**

```text
How should TEA orchestrate multi-step generation and evaluation?
```

**Mục đích:** Xác định cách TEA điều phối các bước kiểu worker trong các workflow:

- `automate`
- `atdd`
- `test-review`
- `nfr-assess`
- `framework`
- `ci`
- `test-design`
- `trace`

`teach-me-testing` không dùng thiết lập này.

**Hành vi từng chế độ:**

| Chế độ       | Hành vi                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------ |
| `auto`       | Khuyến nghị. TEA tự chọn chế độ tốt nhất dựa trên capability runtime nếu probing được bật. |
| `agent-team` | Ưu tiên orchestration theo runtime team/delegation.                                        |
| `subagent`   | Ưu tiên orchestration theo kiểu subagent tách biệt.                                        |
| `sequential` | Bắt buộc chạy tuần tự từng bước. Ổn định nhất nhưng thường chậm nhất.                      |

**Lưu ý quan trọng:** Ở `agent-team` và `subagent`, runtime sẽ quyết định scheduling và concurrency. TEA không tự áp thêm giới hạn worker song song.

**Ảnh hưởng theo workflow:**

| Workflow      | Đơn vị được orchestration             | Chế độ ảnh hưởng thế nào   |
| ------------- | ------------------------------------- | -------------------------- |
| `automate`    | API + E2E/backend generation workers  | Chỉ thay đổi cách dispatch |
| `atdd`        | worker sinh failing API + failing E2E | Chỉ thay đổi cách dispatch |
| `test-review` | worker theo từng chiều chất lượng     | Chỉ thay đổi cách dispatch |
| `nfr-assess`  | worker đánh giá từng miền             | Chỉ thay đổi cách dispatch |
| `framework`   | các work unit tạo scaffold            | Chỉ thay đổi cách dispatch |
| `ci`          | bước sinh pipeline có orchestration   | Chính sách orchestration   |
| `test-design` | bước sinh output có orchestration     | Chính sách orchestration   |
| `trace`       | tách phase/work-unit có dependency    | Chính sách orchestration   |

Hợp đồng đầu ra của mỗi workflow không đổi giữa các chế độ.

**Thứ tự resolve:**

1. Chuẩn hóa cách diễn đạt ở lần chạy hiện tại nếu có:
   - `agent team` / `agent teams` / `agentteam` -> `agent-team`
   - `subagent` / `subagents` / `sub agent` / `sub agents` -> `subagent`
   - `sequential` -> `sequential`
   - `auto` -> `auto`
2. Nếu không có override ở lần chạy hiện tại, dùng `tea_execution_mode` trong `_bmad/tea/config.yaml`.
3. Nếu `tea_capability_probe: true`, phát hiện runtime có hỗ trợ `agent-team` hay `subagent` hay không.
4. Resolve mode:
   - `auto` -> `agent-team` -> `subagent` -> `sequential`
   - với `agent-team`/`subagent` tường minh -> chỉ fallback khi probing được bật
   - `sequential` -> luôn chạy tuần tự

**Ví dụ (khuyến nghị):**

```yaml
tea_execution_mode: 'auto'
```

**Ví dụ (bắt buộc tuần tự):**

```yaml
tea_execution_mode: 'sequential'
```

---

### tea_capability_probe

TEA có nên kiểm tra capability của runtime trước khi resolve execution mode hay không.

**Vị trí schema:** `src/module.yaml` (cấu hình module TEA)

**Cấu hình người dùng:** `_bmad/tea/config.yaml`

**Kiểu:** `boolean`

**Mặc định:** `true`

**Mục đích:** Khi bật, TEA sẽ kiểm tra runtime có thực sự hỗ trợ `agent-team` hoặc `subagent` hay không và fallback an toàn khi cần. Khi tắt, TEA sẽ bám cứng cấu hình và fail nếu runtime không hỗ trợ.

**Ví dụ (khuyến nghị):**

```yaml
tea_capability_probe: true
```

**Ví dụ (strict):**

```yaml
tea_capability_probe: false
```

---

### test_stack_type

Loại stack của dự án, có thể được phát hiện tự động hoặc cấu hình tường minh. Thiết lập này ảnh hưởng tới CI pipeline và chọn framework.

**Vị trí schema:** `src/module.yaml` (cấu hình module TEA)

**Cấu hình người dùng:** `_bmad/tea/config.yaml`

**Kiểu:** `string`

**Mặc định:** `"auto"`

**Tùy chọn:** `"auto"` | `"frontend"` | `"backend"` | `"fullstack"`

**Mục đích:** Điều khiển hành vi theo loại stack:

| Loại stack  | Hành vi                                                           |
| ----------- | ----------------------------------------------------------------- |
| `auto`      | Tự phát hiện từ manifest/config của dự án                         |
| `frontend`  | Browser-based test, cài browser trong CI, burn-in thường được bật |
| `backend`   | API/unit test, không cài browser, burn-in thường bỏ qua           |
| `fullstack` | Có cả frontend lẫn backend, pipeline đầy đủ                       |

**Ảnh hưởng tới workflow:**

- `ci` - pipeline thay đổi theo loại stack
- `framework` - scaffold thay đổi theo stack

**Ví dụ:**

```yaml
test_stack_type: 'fullstack'
```

---

### ci_platform

Nền tảng CI/CD được dùng để sinh pipeline.

**Vị trí schema:** `src/module.yaml` (cấu hình module TEA)

**Cấu hình người dùng:** `_bmad/tea/config.yaml`

**Kiểu:** `string`

**Mặc định:** `"auto"`

**Tùy chọn:** `"auto"` | `"github-actions"` | `"gitlab-ci"` | `"jenkins"` | `"azure-devops"` | `"harness"` | `"circle-ci"` | `"other"`

**Mục đích:** Điều khiển template CI mà TEA sẽ dùng để sinh pipeline.

Khi đặt `"auto"`, TEA sẽ tự phát hiện bằng cách quét các file cấu hình CI hiện có như `.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile`, `azure-pipelines.yml`, `.harness/`, `.circleci/config.yml`, rồi fallback sang suy luận từ git remote nếu cần.

**Ảnh hưởng tới workflow:**

- `ci` - chọn template và đường dẫn output

**Ví dụ:**

```yaml
ci_platform: 'github-actions'
```

---

### test_framework

Test framework được phát hiện tự động hoặc cấu hình tường minh.

**Vị trí schema:** `src/module.yaml` (cấu hình module TEA)

**Cấu hình người dùng:** `_bmad/tea/config.yaml`

**Kiểu:** `string`

**Mặc định:** `"auto"`

**Tùy chọn:** `"auto"` | `"playwright"` | `"cypress"` | `"jest"` | `"vitest"` | `"pytest"` | `"junit"` | `"go-test"` | `"dotnet-test"` | `"rspec"` | `"other"`

**Mục đích:** Điều khiển pattern framework mà TEA dùng cho code generation. Khi đặt `"auto"`, TEA sẽ tự phát hiện từ file cấu hình và manifest của dự án. Hỗ trợ cả frontend framework như Playwright/Cypress/Jest/Vitest và backend framework như pytest/JUnit/Go test/dotnet test/RSpec.

**Ảnh hưởng tới workflow:**

- `framework` - scaffold
- `ci` - câu lệnh test trong pipeline
- `atdd` - pattern sinh test code
- `automate` - pattern sinh test code

**Ví dụ:**

```yaml
test_framework: 'playwright'
```

---

## Cấu hình BMM cốt lõi mà TEA kế thừa

TEA cũng dùng các tùy chọn cấu hình BMM cốt lõi từ `_bmad/tea/config.yaml`.

### output_folder

**Kiểu:** `string`

**Mặc định:** `_bmad-output`

**Mục đích:** Thư mục output gốc cho artifact cốt lõi của BMM. TEA sẽ ghi artifact kiểm thử vào `test_artifacts` (mặc định là `{output_folder}/test-artifacts`).

**Ví dụ:**

```yaml
output_folder: _bmad-output
```

**Các file đầu ra của TEA (nằm trong `{test_artifacts}`):**

- `test-design-architecture.md` + `test-design-qa.md`
- `test-design-epic-N.md`
- `test-review.md`
- `traceability-matrix.md`
- `gate-decision-{gate_type}-{story_id}.md`
- `nfr-assessment.md`
- `automation-summary.md`
- `atdd-checklist-{story_key}.md`

### user_skill_level

**Kiểu:** `enum`

**Tùy chọn:** `beginner` | `intermediate` | `expert`

**Mặc định:** `intermediate`

**Mục đích:** Ảnh hưởng cách TEA giải thích trong chat.

**Ví dụ:**

```yaml
user_skill_level: beginner
```

**Ảnh hưởng tới TEA:**

- **Beginner:** giải thích nhiều hơn, dẫn khái niệm, verbose hơn
- **Intermediate:** cân bằng giữa ngắn gọn và hướng dẫn
- **Expert:** súc tích, kỹ thuật, ít dẫn dắt

### project_name

**Kiểu:** `string`

**Mặc định:** Tên thư mục hiện tại

**Mục đích:** Dùng trong tài liệu và report do TEA tạo ra.

**Ví dụ:**

```yaml
project_name: my-awesome-app
```

### communication_language

**Kiểu:** `string`

**Mặc định:** `english`

**Mục đích:** Ngôn ngữ TEA dùng để phản hồi trong chat.

**Ví dụ:**

```yaml
communication_language: vietnamese
```

### document_output_language

**Kiểu:** `string`

**Mặc định:** `english`

**Mục đích:** Ngôn ngữ TEA dùng để sinh tài liệu như test design hoặc report.

**Ví dụ:**

```yaml
document_output_language: vietnamese
```

**Lưu ý:** Có thể khác với `communication_language`. Ví dụ chat bằng tiếng Việt nhưng tạo tài liệu bằng tiếng Anh.

---

## Biến môi trường

Workflow của TEA có thể dùng biến môi trường để cấu hình test.

### Biến cho test framework

**Playwright:**

```bash
# .env
BASE_URL=https://todomvc.com/examples/react/dist/
API_BASE_URL=https://api.example.com
TEST_USER_EMAIL=test@example.com
TEST_USER_PASSWORD=password123
```

**Cypress:**

```bash
# cypress.env.json or .env
CYPRESS_BASE_URL=https://example.com
CYPRESS_API_URL=https://api.example.com
```

### Biến cho CI/CD

Khai báo trong CI platform, ví dụ GitHub Actions secrets:

```yaml
# .github/workflows/test.yml
env:
  BASE_URL: ${{ secrets.STAGING_URL }}
  API_KEY: ${{ secrets.API_KEY }}
  TEST_USER_EMAIL: ${{ secrets.TEST_USER }}
```

---

## Pattern cấu hình

### Development và Production

**Tách cấu hình theo môi trường:**

```yaml
# _bmad/tea/config.yaml
output_folder: _bmad-output

# .env.development
BASE_URL=http://localhost:3000
API_BASE_URL=http://localhost:4000

# .env.staging
BASE_URL=https://staging.example.com
API_BASE_URL=https://api-staging.example.com

# .env.production (chỉ dùng test read-only!)
BASE_URL=https://example.com
API_BASE_URL=https://api.example.com
```

### Team và cá nhân

**Cấu hình đội (được commit):**

```yaml
# _bmad/tea/config.yaml.example
project_name: team-project
output_folder: _bmad-output
tea_use_playwright_utils: true
tea_browser_automation: 'none'
tea_execution_mode: 'sequential'
```

**Cấu hình cá nhân (thường được gitignore):**

```yaml
# _bmad/tea/config.yaml
user_name: John Doe
user_skill_level: expert
tea_browser_automation: 'auto'
tea_execution_mode: 'auto'
```

### Monorepo

**Cấu hình ở root:**

```yaml
# _bmad/tea/config.yaml
project_name: monorepo-parent
output_folder: _bmad-output
```

**Cấu hình theo package:**

```yaml
# packages/web-app/_bmad/tea/config.yaml
project_name: web-app
output_folder: ../../_bmad-output/web-app
tea_use_playwright_utils: true

# packages/mobile-app/_bmad/tea/config.yaml
project_name: mobile-app
output_folder: ../../_bmad-output/mobile-app
tea_use_playwright_utils: false
```

---

## Best practice cấu hình

### 1. Dùng version control hợp lý

**Nên commit:**

```text
_bmad/tea/config.yaml.example
.nvmrc
package.json
```

**Khuyến nghị thêm vào `.gitignore`:**

```text
_bmad/tea/config.yaml
.env
.env.local
```

### 2. Ghi rõ setup bắt buộc

**Trong README:**

```markdown
## Setup

1. Install BMad

2. Copy config template:
   cp \_bmad/tea/config.yaml.example \_bmad/tea/config.yaml

3. Edit config with your values:
   - Set user_name
   - Enable tea_use_playwright_utils if using playwright-utils
   - Set tea_browser_automation mode (auto, cli, mcp, or none)
   - Set tea_execution_mode (auto, subagent, agent-team, or sequential)
```

### 3. Xác thực cấu hình

**Kiểm tra cấu hình hợp lệ:**

```bash
# Check TEA config is set
cat _bmad/tea/config.yaml | grep tea_use

# Verify playwright-utils installed (if enabled)
npm list @seontechnologies/playwright-utils

# Verify MCP servers configured (if enabled)
# Check your IDE's MCP settings
```

### 4. Giữ cấu hình ở mức tối giản

**Không over-configure:**

```yaml
# ❌ Không tốt - override quá nhiều thứ
project_name: my-project
user_name: John Doe
user_skill_level: expert
output_folder: custom/path
planning_artifacts: custom/planning
implementation_artifacts: custom/implementation
project_knowledge: custom/docs
tea_use_playwright_utils: true
tea_browser_automation: "auto"
tea_execution_mode: "auto"
communication_language: english
document_output_language: english

# ✅ Tốt - chỉ override phần thực sự cần
tea_use_playwright_utils: true
tea_execution_mode: "auto"
output_folder: docs/testing
```

Hãy dùng mặc định khi có thể.

---

## Khắc phục sự cố

### Cấu hình không được nạp

**Vấn đề:** TEA không dùng giá trị cấu hình của tôi.

**Nguyên nhân có thể:**

1. File cấu hình nằm sai vị trí
2. YAML sai cú pháp
3. Sai tên khóa cấu hình

**Cách xử lý:**

```bash
ls -la _bmad/tea/config.yaml
js-yaml _bmad/tea/config.yaml
diff _bmad/tea/config.yaml src/module.yaml
```

### Playwright Utils không hoạt động

**Vấn đề:** `tea_use_playwright_utils: true` nhưng TEA không dùng utility.

**Nguyên nhân có thể:**

1. Chưa cài package
2. Chưa lưu file cấu hình
3. Chạy workflow trước khi cập nhật config

**Cách xử lý:**

```bash
npm list @seontechnologies/playwright-utils
grep tea_use_playwright_utils _bmad/tea/config.yaml
```

Sau đó chạy lại workflow trong chat mới.

### Browser automation không hoạt động

**Vấn đề:** `tea_browser_automation` đặt là `"auto"` / `"cli"` / `"mcp"` nhưng browser không mở.

**Nguyên nhân có thể:**

1. Chưa cài CLI toàn cục
2. Chưa cấu hình MCP server trong IDE
3. Thiếu browser binary

**Cách xử lý:**

```bash
playwright-cli --version
npx @playwright/mcp@latest --version
npx playwright install
```

### Thay đổi config không có hiệu lực

**Nguyên nhân:** TEA nạp config ở đầu workflow.

**Cách xử lý:**

1. Lưu `_bmad/tea/config.yaml`
2. Mở chat mới
3. Chạy lại workflow

---

## Ví dụ cấu hình

### Thiết lập khuyến nghị (full stack)

```yaml
# _bmad/tea/config.yaml
project_name: my-project
user_skill_level: beginner
output_folder: _bmad-output
tea_use_playwright_utils: true
tea_use_pactjs_utils: false
tea_pact_mcp: 'none'
tea_browser_automation: 'auto'
tea_execution_mode: 'auto'
tea_capability_probe: true
```

**Vì sao nên dùng:**

- Playwright Utils: có fixture và utility sẵn sàng cho production
- Pact.js Utils: chỉ nên bật khi dự án thực sự dùng contract testing
- Browser automation ở chế độ `auto`: chọn CLI/MCP thông minh và có fallback

### Thiết lập tối giản (chỉ để học)

```yaml
project_name: my-project
output_folder: _bmad-output
tea_use_playwright_utils: false
tea_use_pactjs_utils: false
tea_pact_mcp: 'none'
tea_browser_automation: 'none'
tea_execution_mode: 'sequential'
tea_capability_probe: true
```

### Thiết lập monorepo

```yaml
# _bmad/tea/config.yaml (root)
project_name: monorepo
output_folder: _bmad-output
tea_use_playwright_utils: true
tea_use_pactjs_utils: false
tea_pact_mcp: 'none'
tea_execution_mode: 'auto'
```

### Template cho đội

```yaml
# _bmad/tea/config.yaml.example
project_name: your-project-name
user_name: Your Name
user_skill_level: intermediate
output_folder: _bmad-output
planning_artifacts: _bmad-output/planning-artifacts
implementation_artifacts: _bmad-output/implementation-artifacts
project_knowledge: docs
tea_use_playwright_utils: true
tea_use_pactjs_utils: false
tea_pact_mcp: 'none'
tea_browser_automation: 'auto'
tea_execution_mode: 'auto'
tea_capability_probe: true
communication_language: english
document_output_language: english
```

### Thiết lập contract testing (opt-in)

Chỉ dùng profile này cho service đã dùng Pact hoặc muốn TEA scaffold pattern contract testing một cách chủ động.

```yaml
tea_use_pactjs_utils: true
tea_pact_mcp: 'none'
```

Nếu đồng thời dùng PactFlow hoặc Pact Broker:

```yaml
tea_use_pactjs_utils: true
tea_pact_mcp: 'mcp'
```

---

## Xem thêm

### How-To Guides

- [Set Up Test Framework](/vi-vn/how-to/workflows/setup-test-framework.md)
- [Integrate Playwright Utils](/vi-vn/how-to/customization/integrate-playwright-utils.md)
- [Configure Browser Automation](/vi-vn/how-to/customization/configure-browser-automation.md)

### Reference

- [TEA Command Reference](/vi-vn/reference/commands.md)
- [Knowledge Base Index](/vi-vn/reference/knowledge-base.md)
- [Glossary](/vi-vn/glossary/index.md)

### Explanation

- [TEA Overview](/vi-vn/explanation/tea-overview.md)
- [Testing as Engineering](/vi-vn/explanation/testing-as-engineering.md)

---

Tạo bằng [BMad Method](https://bmad-method.org) - TEA (Test Engineering Architect)
