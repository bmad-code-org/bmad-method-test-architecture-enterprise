---
title: 'Cấu hình Browser Automation'
description: Thiết lập Playwright CLI và MCP để dùng browser automation trong các workflow của TEA
---

# Cấu hình Browser Automation

TEA có thể tương tác với browser thật trong lúc sinh test để xác minh selector, khám phá UI, thu thập bằng chứng và debug lỗi. Có hai công cụ bổ sung cho nhau:

**CLI và MCP là hai công cụ bổ trợ, không phải đối thủ.** Chế độ `auto` dùng mỗi công cụ ở nơi nó phù hợp nhất: CLI cho snapshot stateless tiết kiệm token, MCP cho automation giàu trạng thái.

## Bốn chế độ

Browser automation của TEA được điều khiển bằng `tea_browser_automation` trong `_bmad/tea/config.yaml`:

```yaml
tea_browser_automation: 'auto' # auto | cli | mcp | none
```

| Chế độ | Hành vi                                                                                                                |
| ------ | ---------------------------------------------------------------------------------------------------------------------- |
| `auto` | TEA tự chọn công cụ phù hợp cho từng hành động. Có fallback an toàn nếu chỉ có một công cụ được cài. **(Khuyến nghị)** |
| `cli`  | Chỉ dùng CLI, bỏ qua MCP kể cả khi đã cấu hình.                                                                        |
| `mcp`  | Chỉ dùng MCP, bỏ qua CLI kể cả khi đã cài. Tương đương hành vi cũ của `tea_use_mcp_enhancements: true`.                |
| `none` | Không tương tác browser, chỉ sinh từ docs và code analysis.                                                            |

## Điều kiện tiên quyết

### Với CLI (`cli` hoặc `auto`)

```bash
npm install -g @playwright/cli@latest
playwright-cli install --skills
```

Lệnh cài npm toàn cục chỉ cần chạy một lần. Phần `playwright-cli install --skills` nên chạy ở root dự án để đăng ký skill vào thư mục skill của công cụ hiện tại.

### Với MCP (`mcp` hoặc `auto`)

Thêm MCP server vào file cấu hình của công cụ bạn đang dùng:

```json
{
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    },
    "playwright-test": {
      "type": "stdio",
      "command": "npx",
      "args": ["playwright", "run-test-mcp-server"]
    },
    "smartbear": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@smartbear/mcp@latest"],
      "env": {
        "PACT_BROKER_BASE_URL": "https://{tenant}.pactflow.io",
        "PACT_BROKER_TOKEN": "<your-api-token>"
      }
    }
  }
}
```

`smartbear` là tùy chọn, chỉ cần khi bạn dùng tích hợp Pact MCP.

### Đặt cấu hình ở đâu

| Công cụ           | File cấu hình                         | Định dạng              |
| ----------------- | ------------------------------------- | ---------------------- |
| Claude Code       | `~/.claude.json`                      | JSON (`mcpServers`)    |
| Codex             | `~/.codex/config.toml`                | TOML (`[mcp_servers]`) |
| Gemini CLI        | `~/.gemini/settings.json`             | JSON (`mcpServers`)    |
| Cursor            | `~/.cursor/mcp.json`                  | JSON (`mcpServers`)    |
| Windsurf          | `~/.codeium/windsurf/mcp_config.json` | JSON (`mcpServers`)    |
| VS Code (Copilot) | `.vscode/mcp.json`                    | JSON (`servers`)       |

> **Mẹo với Claude Code:** ưu tiên dùng `claude mcp add` thay vì sửa JSON tay để tránh sai định dạng.

### CLI shortcut

```bash
# Claude Code
claude mcp add -s user --transport stdio playwright -- npx -y @playwright/mcp@latest
claude mcp add -s user --transport stdio playwright-test -- npx playwright run-test-mcp-server

# Codex
codex mcp add playwright -- npx -y @playwright/mcp@latest
codex mcp add playwright-test -- npx playwright run-test-mcp-server
```

### Định dạng TOML cho Codex

```toml
[mcp_servers.playwright]
command = "npx"
args = ["-y", "@playwright/mcp@latest"]

[mcp_servers.playwright-test]
command = "npx"
args = ["playwright", "run-test-mcp-server"]
```

Lưu ý khóa là `mcp_servers`, không phải `mcpServers`.

## Cách `auto` mode hoạt động

Khi `tea_browser_automation: "auto"`, TEA chọn công cụ theo ngữ cảnh:

### Ưu tiên 1: User override

Nếu bạn nói rõ “dùng CLI” hoặc “dùng MCP”, TEA sẽ tôn trọng.

### Ưu tiên 2: Auto heuristic

**CLI phù hợp hơn cho tác vụ stateless, nhanh:**

- Mở trang, chụp snapshot, liệt kê element
- Chụp selector hoặc cấu trúc trang
- Xác minh locator có tồn tại hay không
- Chụp screenshot/trace làm bằng chứng

**MCP phù hợp hơn cho tác vụ stateful, nhiều bước:**

- Luồng dài cần giữ trạng thái
- Multi-tab, upload file, wizard nhiều bước
- Tương tác phức tạp như drag/drop
- Self-healing khi cần đọc DOM sâu hơn

### Ưu tiên 3: Fallback

- Nếu CLI không có -> fallback sang MCP
- Nếu MCP không có -> fallback sang CLI
- Nếu cả hai đều không có -> quay về `none`

## Workflow nào hưởng lợi

| Workflow      | Công cụ thường dùng ở `auto` | Use case                                             |
| ------------- | ---------------------------- | ---------------------------------------------------- |
| `test-design` | CLI                          | Khám phá trang, snapshot, discovery                  |
| `atdd`        | CLI + MCP                    | Capture cơ bản bằng CLI, tương tác phức tạp bằng MCP |
| `automate`    | CLI + MCP                    | Verify selector bằng CLI, healing bằng MCP           |
| `test-review` | CLI                          | Thu thập trace, screenshot, network                  |
| `nfr-assess`  | CLI                          | Theo dõi timing và network                           |

## Override theo từng yêu cầu

Ngay cả khi đang dùng `auto`, bạn vẫn có thể chỉ định:

```text
Use the CLI to snapshot the login page
Open MCP browser and walk through the checkout wizard
```

TEA sẽ làm theo yêu cầu tường minh đó.

## Chuyển từ `tea_use_mcp_enhancements`

| Thiết lập cũ                      | Thiết lập mới tương đương        |
| --------------------------------- | -------------------------------- |
| `tea_use_mcp_enhancements: true`  | `tea_browser_automation: "auto"` |
| `tea_use_mcp_enhancements: false` | `tea_browser_automation: "none"` |

Installer của BMAD sẽ tự migrate cấu hình cũ nếu cần.

## Khắc phục sự cố

### CLI không hoạt động

```bash
playwright-cli --version
npm install -g @playwright/cli@latest
playwright-cli install --skills
```

### MCP không hoạt động

1. Kiểm tra MCP server đã được khai báo trong IDE chưa
2. Khởi động lại IDE sau khi sửa config
3. Kiểm tra:

```bash
npx @playwright/mcp@latest --version
```

### Auto mode không chọn đúng công cụ như mong muốn

Auto mode thường log lý do:

- `Using CLI for snapshot (stateless discovery)`
- `Using MCP for multi-step recording (stateful flow)`

Hãy xem output của workflow để biết vì sao nó chọn công cụ đó.

### Dọn session bị treo

Nếu có browser process bị treo:

```bash
playwright-cli list
playwright-cli -s=tea-explore close
playwright-cli close-all
```

## Tài liệu liên quan

- [TEA Overview -- Browser Automation](/vi-vn/explanation/tea-overview.md)
- [Integrate Playwright Utils](/vi-vn/how-to/customization/integrate-playwright-utils.md)
- [TEA Configuration Reference](/vi-vn/reference/configuration.md)

---

Tạo bằng [BMad Method](https://bmad-method.org) - TEA (Test Engineering Architect)
