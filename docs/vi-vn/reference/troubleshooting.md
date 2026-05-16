---
title: Hướng dẫn khắc phục sự cố
description: Chẩn đoán và xử lý các vấn đề thường gặp khi sử dụng TEA
---

# Hướng dẫn khắc phục sự cố

Tài liệu này giúp bạn chẩn đoán và xử lý các vấn đề thường gặp khi dùng TEA (Test Engineering Architect).

## Mục lục

- Installation Issues
- Agent Loading Issues
- Workflow Execution Issues
- Knowledge Base Issues
- Configuration Issues
- Output and File Issues
- Integration Issues
- Performance Issues
- Getting Help

---

## Vấn đề cài đặt

### Không thấy module TEA sau khi cài

**Triệu chứng:** Chạy `npx bmad-method install` xong nhưng không thấy agent TEA.

**Nguyên nhân có thể:**

- Bạn chưa chọn TEA khi cài
- Quá trình cài thất bại âm thầm
- Thư mục `_bmad/tea/` chưa được tạo

**Cách xử lý:**

```bash
ls -la _bmad/tea/
npx bmad-method install
npx bmad-method install --verbose
```

### Cài TEA sau firewall công ty

Nếu installer chạy được nhưng không thể tải module TEA từ GitHub, hãy trỏ sang local clone hoặc internal mirror.

1. Clone TEA về local hoặc mirror nội bộ
2. Sửa `external-official-modules.yaml` để `url:` trỏ tới local path
3. Chạy lại installer

### Cài đặt bị treo

**Nguyên nhân thường gặp:**

- Mạng có vấn đề
- NPM timeout
- Thiếu dung lượng đĩa

**Cách xử lý:**

```bash
ping registry.npmjs.org
df -h
npm cache clean --force
npx bmad-method install
```

---

## Vấn đề nạp agent

### Lỗi “Agent not found”

**Triệu chứng:** báo lỗi agent `tea` hoặc `_bmad/tea` không tìm thấy.

**Cách xử lý:**

```bash
ls -la _bmad/tea/agents/bmad-tea/SKILL.md
node tools/validate-agent-schema.js
rm -rf _bmad/tea/
npx bmad-method install
```

### TEA nạp được nhưng command không chạy

**Nguyên nhân có thể:**

- Thiếu workflow file
- Sai đường dẫn workflow
- YAML lỗi cú pháp

**Cách xử lý:**

```bash
ls -la _bmad/tea/workflows/testarch/
cat _bmad/tea/workflows/testarch/bmad-testarch-test-design/workflow.yaml
```

Thử gọi trực tiếp:

```text
/bmad:tea:test-design
$bmad-tea-testarch-test-design
```

### Workflow tùy chỉnh không còn xuất hiện

TEA hiện là module tách riêng. Custom workflow sẽ không tự merge vào core nữa.

**Cách xử lý:**

1. Đóng gói workflow thành custom content hoặc custom module
2. Gắn vào `bmad-tea` bằng file customization dưới `_bmad/_config/agents/`
3. Chạy lại `npx bmad-method install`

---

## Vấn đề khi chạy workflow

### Workflow chạy nhưng không sinh output

**Nguyên nhân có thể:**

- Output directory chưa có hoặc không ghi được
- `test_artifacts` chưa cấu hình đúng
- Workflow dừng trước bước output generation

**Cách xử lý:**

```bash
cat _bmad/tea/module.yaml | grep test_artifacts
mkdir -p test-results
ls -la test-results/
```

### Subagent thất bại

**Nguyên nhân có thể:**

- Thiếu step file
- Không ghi được temp file
- Output format của subagent không hợp lệ
- Runtime không hỗ trợ execution mode hiện tại

**Cách xử lý:**

```bash
ls -la _bmad/tea/workflows/testarch/bmad-testarch-automate/steps-c/step-03*.md
ls -la /tmp/ | grep bmad-tea
grep -E "tea_execution_mode|tea_capability_probe" _bmad/tea/config.yaml
```

Nếu cần fallback an toàn:

```yaml
tea_execution_mode: 'sequential'
tea_capability_probe: true
```

### Knowledge fragment không được nạp

**Nguyên nhân có thể:**

- Thiếu hoặc hỏng `tea-index.csv`
- Thiếu file fragment
- Workflow không khai báo fragment đúng

**Cách xử lý:**

```bash
cat _bmad/tea/agents/bmad-tea/resources/tea-index.csv | wc -l
ls -la _bmad/tea/agents/bmad-tea/resources/knowledge/ | wc -l
head -5 _bmad/tea/agents/bmad-tea/resources/tea-index.csv
grep -A 5 "knowledge_fragments" _bmad/tea/workflows/testarch/bmad-testarch-test-design/workflow.yaml
```

---

## Vấn đề cấu hình

### Không thấy prompt cấu hình khi cài

**Nguyên nhân có thể:**

- `prompt: false` trong `module.yaml`
- Installer đang chạy non-interactive
- `module.yaml` bị cấu hình sai

**Cách xử lý:**

```bash
cat _bmad/tea/module.yaml | grep -A 3 "test_artifacts"
npx bmad-method install --interactive
```

### Playwright Utils không hoạt động

**Nguyên nhân có thể:**

- `tea_use_playwright_utils` đang là `false`
- Thiếu knowledge fragment liên quan
- Workflow đang dùng không hỗ trợ tích hợp này

**Cách xử lý:**

```bash
cat _bmad/tea/module.yaml | grep tea_use_playwright_utils
grep -i "playwright-utils" _bmad/tea/agents/bmad-tea/resources/tea-index.csv
```

---

## Vấn đề output và file

### Test được sinh ra sai vị trí

**Nguyên nhân có thể:**

- `test_artifacts` cấu hình sai
- Nhầm đường dẫn tương đối
- Working directory bị thay đổi

**Cách xử lý:**

```bash
cat _bmad/tea/module.yaml | grep test_artifacts
pwd
```

### Test sinh ra bị lỗi cú pháp

**Nguyên nhân có thể:**

- Mismatch framework (Playwright/Cypress)
- Nạp sai template
- Knowledge fragment bị lỗi

**Cách xử lý:**

```text
Generate Playwright tests using TypeScript
```

Sau đó kiểm tra:

```bash
npx eslint tests/**/*.spec.ts
markdownlint _bmad/tea/agents/bmad-tea/resources/knowledge/*.md
```

### Lỗi quyền file

**Cách xử lý:**

```bash
ls -la test-results/
chmod -R u+w test-results/
df -h
```

---

## Vấn đề tích hợp

### Không tìm thấy Playwright Utils

**Nguyên nhân có thể:**

- Package chưa cài
- Sai import path
- Sai version

**Cách xử lý:**

```bash
npm install @muratkeremozcan/playwright-utils
npm ls @muratkeremozcan/playwright-utils
```

### Browser automation không hoạt động

**Triệu chứng:** `tea_browser_automation` đặt là `"auto"` / `"cli"` / `"mcp"` nhưng đầu ra không có browser feature.

**Cách xử lý:**

```bash
playwright-cli --version
cat _bmad/tea/config.yaml | grep tea_browser_automation
```

Kiểm tra MCP config trong IDE và khởi động lại IDE sau khi sửa.

---

## Vấn đề hiệu năng

### Workflow chạy quá lâu

**Nguyên nhân có thể:**

- Codebase lớn
- Review quá nhiều test cùng lúc
- Overhead do subagent
- Mạng chậm

**Cách xử lý:**

- Thu hẹp phạm vi review
- Chạy theo thư mục thay vì toàn bộ suite
- Tập trung vào workflow mục tiêu thay vì audit toàn phần

### Nạp knowledge base chậm

Điều này có thể là hành vi bình thường khi workflow phải nạp nhiều fragment. Lần chạy sau thường nhanh hơn do cache tốt hơn.

---

## Khi cần trợ giúp

### Bật debug mode

```bash
export DEBUG=bmad:tea:*
```

### Thu thập thông tin chẩn đoán

Khi báo lỗi, nên kèm:

1. Phiên bản TEA
2. Phiên bản BMAD
3. Phiên bản Node
4. Hệ điều hành
5. Cấu trúc thư mục `_bmad/tea/`
6. Toàn bộ error message
7. Các bước tái hiện

### Kênh hỗ trợ

- Documentation: <https://test-architect.bmad-method.org>
- GitHub Issues: <https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/issues>
- GitHub Discussions: <https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/discussions>

## Error message thường gặp

### `Module 'tea' not found`

Reinstall TEA bằng `npx bmad-method install`.

### `Knowledge fragment 'test-quality' not found`

Kiểm tra `tea-index.csv` và danh sách fragment.

### `Cannot write to test-results/`

Tạo thư mục và sửa quyền.

### `Workflow 'test-design' failed at step 3`

Kiểm tra step file tồn tại hay không.

### `Agent YAML validation failed`

Chạy:

```bash
node tools/validate-agent-schema.js
```

### `Subagent execution timeout`

Thu hẹp phạm vi workflow hoặc chuyển sang chế độ `sequential`.

## Troubleshooting nâng cao

### Script kiểm tra thủ công cài đặt TEA

```bash
#!/bin/bash
echo "Validating TEA Installation..."

if [ -f "_bmad/tea/agents/bmad-tea/SKILL.md" ]; then
  echo "✓ Agent skill exists"
else
  echo "✗ Agent skill missing"
fi
```

Bạn có thể mở rộng script này để kiểm tra workflow, knowledge fragment và `tea-index.csv`.

### Reset TEA về trạng thái sạch

```bash
cp _bmad/tea/module.yaml /tmp/tea-module-backup.yaml
rm -rf _bmad/tea/
npx bmad-method install
cp /tmp/tea-module-backup.yaml _bmad/tea/module.yaml
```

---

Nếu vẫn bị kẹt, hãy mở GitHub Issue kèm thông tin chẩn đoán.
