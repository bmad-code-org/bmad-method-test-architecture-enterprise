---
title: Kiến trúc step-file của TEA
description: Giải thích kiến trúc step-file để đạt mức tuân thủ LLM gần như tuyệt đối
---

# Kiến trúc step-file của TEA

**Phiên bản**: 1.0  
**Ngày**: 2026-01-27  
**Mục đích**: giải thích kiến trúc step-file nhằm đạt mức tuân thủ LLM gần như 100%

---

## Vì sao cần step file

### Bài toán

Các file hướng dẫn workflow kiểu truyền thống thường gặp hội chứng "quá nhiều context":

- **LLM dễ ứng biến sai**: khi nhận file chỉ dẫn quá lớn, mô hình dễ bỏ sót bước hoặc tự thêm hành vi
- **Không tuân thủ chặt**: chỉ dẫn kiểu "phân tích codebase rồi sinh test" quá mơ hồ
- **Quá tải context**: file 5000 từ làm cửa sổ ngữ cảnh bị lãng phí
- **Đầu ra khó đoán**: cùng một workflow có thể cho kết quả khác nhau ở mỗi lần chạy

### Lời giải: step files

**Step files** chia workflow thành những đơn vị chỉ dẫn nhỏ, tự đầy đủ:

- **Một step = một hành động rõ ràng**
- **Điều kiện thoát tường minh**
- **Inject context vào từng bước**
- **Ngăn mô hình ứng biến ngoài phạm vi**

**Kết quả**: workflow ổn định hơn, dự đoán được hơn và nhất quán hơn.

---

## Tổng quan kiến trúc

### Trước khi có step files

```text
workflow/
├── workflow.yaml
├── instructions.md
├── checklist.md
└── templates/
```

**Vấn đề:**

- Chỉ dẫn quá dài nên dễ bị lướt qua
- Không có điểm dừng rõ
- Hướng dẫn mơ hồ nên mỗi lần hiểu một kiểu

### Sau khi có step files

```text
workflow/
├── workflow.yaml
├── checklist.md
├── templates/
└── steps/
    ├── step-1-setup.md
    ├── step-2-analyze.md
    ├── step-3-generate.md
    └── step-4-validate.md
```

**Lợi ích:**

- Chỉ dẫn hạt mịn, tập trung từng việc
- Có điều kiện kết thúc rõ ràng
- Lặp lại context cần thiết
- Hỗ trợ subagent và chạy song song

---

## Các nguyên tắc của step file

### 1. Nạp đúng lúc, just-in-time loading

**Chỉ nạp step hiện tại**, không nạp toàn bộ các step cùng lúc.

```yaml
steps:
  - file: steps/step-1-setup.md
    next: steps/step-2-analyze.md
  - file: steps/step-2-analyze.md
    next: steps/step-3-generate.md
```

Agent đọc **một file step**, thực thi xong rồi mới nạp step tiếp theo.

### 2. Context injection

Mỗi step **lặp lại phần context bắt buộc**, không giả định LLM nhớ chính xác mọi thứ từ bước trước.

```markdown
## Context (from previous steps)

You have:

- Analyzed codebase and identified 3 features: Auth, Checkout, Profile
- Loaded knowledge fragments: fixture-architecture, api-request, network-first
- Determined test framework: Playwright with TypeScript

## Your Task (Step 3 Only)

Generate API tests for the 3 features identified above...
```

### 3. Điều kiện thoát tường minh

Mỗi step phải nói rõ khi nào được chuyển bước.

```markdown
## Exit Condition

You may proceed to Step 4 when:

- ✅ All API tests generated and saved to files
- ✅ Test files use knowledge fragment patterns
- ✅ All tests have .spec.ts extension
- ✅ Tests are syntactically valid TypeScript
```

### 4. Ranh giới hành động nghiêm ngặt

Mỗi step phải chỉ ra rõ việc **phải làm** và **không được làm**.

```markdown
## What You MUST Do

- Generate API tests only
- Use patterns from loaded knowledge fragments
- Save to tests/api/ directory

## What You MUST NOT Do

- ❌ Do NOT generate E2E tests
- ❌ Do NOT run tests yet
- ❌ Do NOT refactor existing code
```

### 5. Hỗ trợ subagent

Các step độc lập có thể được tách sang subagent để chạy song song.

Ví dụ ở workflow `automate`:

```text
Step 1-2: Sequential
Step 3: Subagent A (API tests) + Subagent B (E2E tests)
Step 4: Aggregate + validate
```

Xem thêm [subagent-architecture.md](./subagent-architecture.md).

---

## Các pattern step-file trong workflow TEA

### Pattern 1: Sequential steps

**Dùng cho**: `framework`, `ci`

```text
Step 1: Setup → Step 2: Configure → Step 3: Generate → Step 4: Validate
```

Đặc điểm:

- Mỗi bước phụ thuộc đầu ra của bước trước
- Không song song hóa được
- Phù hợp cho workflow ngắn và chạy một lần

### Pattern 2: Parallel generation

**Dùng cho**: `automate`, `atdd`

```text
Step 1: Setup
Step 2: Load knowledge
Step 3: PARALLEL
  ├── Subagent A: Generate API tests
  └── Subagent B: Generate E2E tests
Step 4: Aggregate + validate
```

Đặc điểm:

- Các tác vụ sinh test độc lập chạy song song
- Cải thiện hiệu năng khoảng 40-50%
- Là nhóm workflow dùng thường xuyên nhất

### Pattern 3: Parallel validation

**Dùng cho**: `test-review`, `nfr-assess`

```text
Step 1: Load context
Step 2: PARALLEL
  ├── Subagent A: Check dimension 1
  ├── Subagent B: Check dimension 2
  ├── Subagent C: Check dimension 3
Step 3: Aggregate scores
```

### Pattern 4: Two-phase workflow

**Dùng cho**: `trace`

```text
Phase 1: Generate coverage matrix
Phase 2: Read matrix → apply decision tree → generate gate
```

### Pattern 5: Risk-based planning

**Dùng cho**: `test-design`

```text
Step 1: Load context
Step 2: Load knowledge fragments
Step 3: Assess risk
Step 4: Generate scenarios
Step 5: Prioritize
Step 6: Output test design document
```

---

## Tích hợp knowledge fragments

### Nạp fragment trong step files

Step files có thể yêu cầu nạp fragment một cách tường minh:

```markdown
## Step 2: Load Knowledge Fragments

Consult `{project-root}/_bmad/tea/agents/bmad-tea/resources/tea-index.csv` and load:

1. **fixture-architecture**
2. **api-request**
3. **network-first**
```

Các fragment này đóng vai trò như chuẩn chất lượng để áp vào test sinh ra.

### Cưỡng chế việc dùng fragment

```markdown
## Requirements

Generated tests MUST follow patterns from loaded fragments:

✅ Use fixture composition pattern
✅ Use await apiRequest() helper
✅ Intercept before navigate

❌ Do NOT use custom patterns
❌ Do NOT skip fragment patterns
```

---

## Mẫu step file chuẩn

### Cấu trúc tiêu chuẩn

```markdown
# Step N: [Action Name]

## Context (from previous steps)

## Your Task (Step N Only)

## Requirements

## What You MUST Do

## What You MUST NOT Do

## Exit Condition

## Next Step
```

### Ví dụ step file cho việc sinh API test

```markdown
# Step 3A: Generate API Tests (Subagent)

## Context (from previous steps)

You have:

- Analyzed codebase and identified 3 features: Auth, Checkout, Profile
- Loaded knowledge fragments: api-request, data-factories, api-testing-patterns
- Determined test framework: Playwright with TypeScript
- Config: use_playwright_utils = true

## Your Task (Step 3A Only)

Generate API tests for the 3 features identified above.

## Requirements

- ✅ Generate tests for all 3 features
- ✅ Use Playwright Utils `apiRequest()` helper
- ✅ Use data factories for test data
- ✅ Save to tests/api/ directory

## What You MUST Do

1. For each feature, create `tests/api/[feature].spec.ts`
2. Import fixtures và helper cần thiết
3. Sinh 3-5 test case cho happy path và edge case
4. Lưu tất cả file xuống đĩa

## What You MUST NOT Do

- ❌ Do NOT generate E2E tests
- ❌ Do NOT run tests yet
- ❌ Do NOT hardcode test data
```

Phần output có thể được ghi ra file JSON tạm để main workflow đọc lại.

---

## Validation và bảo đảm chất lượng

### BMad Builder validation

Tất cả 9 workflow TEA được đánh giá đạt **100%** trên BMad Builder validation. Báo cáo validation nằm trong `src/workflows/testarch/*/validation-report-*.md`.

**Tiêu chí validation:**

- Chỉ dẫn rõ ràng, hạt mịn
- Có exit condition cụ thể
- Có context injection
- Có action boundary chặt chẽ
- Có hỗ trợ subagent khi cần

### Kiểm thử trên dự án thực

Tất cả 9 workflow đều đã được thử với dự án thật:

- `teach-me-testing`
- `test-design`
- `automate`
- `atdd`
- `test-review`
- `nfr-assess`
- `trace`
- `framework`
- `ci`

Mục tiêu là giảm ứng biến ngoài ý muốn và cho đầu ra ổn định hơn.

---

## Duy trì step files

### Khi nào nên cập nhật

Hãy cập nhật step files khi:

1. Knowledge fragments thay đổi
2. Xuất hiện pattern mới
3. LLM vẫn còn ứng biến sai
4. Có vấn đề hiệu năng
5. Nhận được phản hồi người dùng về điểm chưa rõ

### Best practices

1. Giữ step đủ nhỏ, khoảng 200-500 từ
2. Lặp lại context cần thiết
3. Viết thật cụ thể
4. Ghi rõ điều không được làm
5. Chạy validation lại sau khi sửa

### Anti-pattern cần tránh

- Step dài quá 1000 từ
- Chỉ dẫn mơ hồ như "analyze codebase"
- Không có exit condition
- Giả định mô hình nhớ chính xác bước trước
- Nhét nhiều nhiệm vụ vào cùng một step

---

## Lợi ích hiệu năng

### Trước và sau khi có step files

**Trước đây, chạy tuần tự:**

- `automate`: khoảng 10 phút
- `test-review`: khoảng 5 phút
- `nfr-assess`: khoảng 12 phút

**Sau khi chia step và dùng subagent:**

- `automate`: khoảng 5 phút, nhanh hơn khoảng 50%
- `test-review`: khoảng 2 phút, nhanh hơn khoảng 60%
- `nfr-assess`: khoảng 4 phút, nhanh hơn khoảng 67%

### Người dùng nhìn thấy gì

Người dùng không cần hiểu nội bộ step-file, nhưng sẽ thấy:

1. Đầu ra ổn định hơn
2. Workflow nhanh hơn
3. Chất lượng đều tay hơn
4. Hành vi ít bất ngờ hơn

Ví dụ tiến trình:

```text
✓ Step 1: Setup complete
✓ Step 2: Knowledge fragments loaded
⟳ Step 3: Generating tests (2 subagents running)
  ├── Subagent A: API tests... ✓
  └── Subagent B: E2E tests... ✓
✓ Step 4: Aggregating results
✓ Step 5: Validation complete
```

---

## Troubleshooting

### Sự cố thường gặp

**LLM vẫn ứng biến sai dù đã có step files**

- Chẩn đoán: chỉ dẫn vẫn còn mơ hồ
- Cách sửa: thêm requirements và forbidden actions rõ hơn

**Output từ subagent không được aggregate đúng**

- Chẩn đoán: lệch đường dẫn file tạm hoặc lỗi parse JSON
- Cách sửa: kiểm tra naming convention và format JSON

**Knowledge fragments không được dùng**

- Chẩn đoán: phần hướng dẫn nạp fragment chưa đủ rõ
- Cách sửa: viết requirement rõ và ràng buộc hơn

**Workflow vẫn chậm**

- Chẩn đoán: chưa tách đủ bước độc lập để song song hóa
- Cách sửa: xác định thêm các step có thể giao cho subagent

---

## Tham chiếu

- **Subagent Architecture**: [subagent-architecture.md](./subagent-architecture.md)
- **Knowledge Base System**: [knowledge-base-system.md](./knowledge-base-system.md)
- **BMad Builder Validation Reports**: `src/workflows/testarch/*/validation-report-*.md`
- **TEA Workflow Examples**: `src/workflows/testarch/*/steps/*.md`

## Hướng phát triển tiếp theo

1. Sinh step động theo độ phức tạp workflow
2. Cache output của step cho đầu vào giống nhau
3. Tự chia step nhỏ hơn nếu quá phức tạp
4. Trình chỉnh sửa step trực quan
5. Template step tái sử dụng cho pattern phổ biến

---

**Trạng thái**: sẵn sàng cho production  
**Validation**: 9 workflow đạt điểm tuyệt đối trên BMad Builder validation  
**Kiểm thử**: đã được thử trên dự án thật  
**Bước tiếp theo**: tiếp tục áp dụng subagent pattern ở các workflow phù hợp
