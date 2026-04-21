---
title: 'Cách chạy Trace với TEA'
description: Ánh xạ requirement, spec hoặc user journey với test và đưa ra quality gate decision bằng workflow trace của TEA
---

# Cách chạy Trace với TEA

Dùng workflow `trace` của TEA để làm coverage traceability và quality gate decision. Đây là workflow gồm **2 phase**:

- **Phase 1**: phân tích coverage
- **Phase 2**: đưa ra quyết định go/no-go

Workflow này sẽ tự resolve coverage oracle tốt nhất có thể: ưu tiên formal requirements, sau đó đến contract/spec artifact, rồi external pointer có thể truy được, và cuối cùng là synthetic journey suy luận từ source nếu là brownfield.

## Khi nào nên dùng

### Phase 1: Coverage Traceability

- Map requirement hoặc inferred journey với test đã implement
- Tìm khoảng trống coverage
- Ưu tiên test còn thiếu
- Refresh coverage sau mỗi story hoặc epic

### Phase 2: Quality Gate Decision

- Đưa ra quyết định go/no-go cho release
- Kiểm tra coverage có đạt ngưỡng không
- Ghi lại gate decision bằng bằng chứng
- Hỗ trợ waiver được business chấp thuận

## Điều kiện tiên quyết

- Đã cài BMad Method
- Agent TEA có sẵn
- Có requirements/spec hoặc source tree đủ để phân tích
- Đã có test được implement
- Với brownfield: codebase hiện có và có test

## Các bước thực hiện

### 1. Chạy workflow Trace

```text
trace
```

### 2. Chỉ định phase

TEA sẽ hỏi bạn đang chạy phase nào.

**Phase 1: Coverage Traceability**

- Phân tích coverage
- Tìm gap
- Sinh recommendation

**Phase 2: Quality Gate Decision**

- Đưa ra `PASS`, `CONCERNS`, `FAIL`, hoặc `WAIVED`
- Yêu cầu đã hoàn tất Phase 1

**Luồng phổ biến:** chạy Phase 1 trước, review gap, sau đó chạy Phase 2 để ra gate decision.

---

## Phase 1: Coverage Traceability

### 3. Cung cấp coverage source

TEA sẽ tìm coverage oracle tốt nhất hiện có.

| Nguồn           | Ví dụ                            | Phù hợp nhất cho           |
| --------------- | -------------------------------- | -------------------------- |
| **Story file**  | `story-profile-management.md`    | coverage cho một story     |
| **Test design** | `test-design-epic-1.md`          | coverage cho một epic      |
| **PRD**         | `PRD.md`                         | coverage ở mức hệ thống    |
| **Spec**        | `openapi.yaml`                   | coverage cho API/contract  |
| **Pointer**     | `requirements.md -> tracker/doc` | hệ thống record bên ngoài  |
| **Synthetic**   | inferred from `src/`             | fallback cho brownfield UI |
| **Multiple**    | nhiều nguồn cùng lúc             | phân tích toàn diện        |

**Ví dụ trả lời:**

```text
Coverage sources:
- story-profile-management.md (acceptance criteria)
- test-design-epic-1.md (test priorities)
```

Nếu không có bất kỳ nguồn nào và `allow_synthetic_oracle` được bật, TEA sẽ suy luận provisional journey từ route/page/screen, user action chính, auth flow và UI state quan trọng, rồi trace test theo các journey này với mức confidence rõ ràng.

### 4. Chỉ định vị trí test

TEA sẽ hỏi test nằm ở đâu.

**Ví dụ:**

```text
Test location: tests/
Include:
- tests/api/
- tests/e2e/
```

### 5. Chỉ định focus area nếu cần

**Ví dụ:**

```text
Focus on:
- Profile CRUD operations
- Validation scenarios
- Authorization checks
```

### 6. Review coverage matrix

TEA sẽ sinh một traceability matrix khá đầy đủ.

#### Ví dụ `traceability-matrix.md`

```markdown
# Requirements Traceability Matrix

**Date:** 2026-01-13
**Scope:** Epic 1 - User Profile Management
**Phase:** Phase 1 (Traceability Analysis)

## Coverage Summary

| Metric                 | Count | Percentage |
| ---------------------- | ----- | ---------- |
| **Total Requirements** | 15    | 100%       |
| **Full Coverage**      | 11    | 73%        |
| **Partial Coverage**   | 3     | 20%        |
| **No Coverage**        | 1     | 7%         |

### By Priority

| Priority | Total | Covered | Percentage         |
| -------- | ----- | ------- | ------------------ |
| **P0**   | 5     | 5       | 100% ✅            |
| **P1**   | 6     | 5       | 83% ⚠️             |
| **P2**   | 3     | 1       | 33% ⚠️             |
| **P3**   | 1     | 0       | 0% ✅ (acceptable) |
```

#### Ví dụ traceability chi tiết

```markdown
### ✅ Requirement 1: User can view their profile (P0)

**Acceptance Criteria:**

- User navigates to /profile
- Profile displays name, email, avatar
- Data is current (not cached)

**Test Coverage:** FULL ✅

**Tests:**

- `tests/e2e/profile-view.spec.ts:15`
- `tests/api/profile.spec.ts:8`
```

```markdown
### ⚠️ Requirement 2: User can edit profile (P0)

**Acceptance Criteria:**

- User clicks "Edit Profile"
- Can modify name, email, bio
- Can upload avatar
- Changes are persisted
- Success message shown

**Test Coverage:** PARTIAL ⚠️

**Missing Coverage:**

- Bio field not tested
- Avatar upload not tested

**Gap Severity:** HIGH
```

```markdown
### ❌ Requirement 15: Profile export as PDF (P2)

**Test Coverage:** NONE ❌

**Recommendation:** Add in next iteration (not blocking for release)
```

### 7. Review gap prioritization

TEA thường nhóm gap thành:

#### Critical Gaps

| Gap | Requirement              | Priority | Risk | Recommendation      |
| --- | ------------------------ | -------- | ---- | ------------------- |
| 1   | Bio field not tested     | P0       | High | Add E2E + API tests |
| 2   | Avatar upload not tested | P0       | High | Add E2E + API tests |

#### Non-Critical Gaps

| Gap | Requirement               | Priority | Risk | Recommendation      |
| --- | ------------------------- | -------- | ---- | ------------------- |
| 3   | Profile export not tested | P2       | Low  | Add in v1.3 release |

### 8. Review recommendation

TEA có thể gợi ý test cụ thể cần thêm.

**Ví dụ:**

```typescript
test('should edit bio field', async ({ page }) => {
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Bio').fill('New bio text');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('New bio text')).toBeVisible();
});
```

Với Playwright Utils, TEA cũng có thể gợi ý pattern dùng `apiRequest` và `authToken`.

### 9. Sau Phase 1 nên làm gì

Thông thường:

1. Sửa critical gap
2. Chạy `test-review` để đảm bảo chất lượng
3. Chạy Phase 2 để ra gate decision

---

## Phase 2: Quality Gate Decision

Sau khi Phase 1 hoàn tất, chạy lại `trace` cho Phase 2.

**Điều kiện tiên quyết:**

- Có `traceability-matrix.md`
- Có kết quả chạy test thực tế

**Lưu ý:** Nếu không có test execution result, Phase 2 sẽ bị bỏ qua. Gate decision cần bằng chứng chạy test thật.

### 10. Chạy lại `trace`

```text
trace
```

Chọn:

```text
Phase 2: Quality Gate Decision
```

### 11. Cung cấp thêm ngữ cảnh

TEA sẽ hỏi:

**Gate Type**

- Story gate
- Epic gate
- Release gate
- Hotfix gate

**Decision Mode**

- **Deterministic** - theo rule và threshold
- **Manual** - team quyết định với hướng dẫn từ TEA

**Ví dụ:**

```text
Gate type: Epic gate
Decision mode: Deterministic
```

### 12. Cung cấp supporting evidence

TEA thường sẽ yêu cầu:

```text
traceability-matrix.md
test-review.md
nfr-assessment.md
test execution results
```

### 13. Review gate decision

TEA sẽ ghi ra file riêng như:

`gate-decision-{gate_type}-{story_id}.md`

#### Ví dụ gate decision

```markdown
# Phase 2: Quality Gate Decision

**Gate Type:** Epic Gate
**Decision:** PASS ✅
**Date:** 2026-01-13

## Decision Summary

**Verdict:** Ready to release

**Evidence:**

- P0 coverage: 100%
- P1 coverage: 100%
- Test quality score: 84/100
- NFR assessment: PASS
```

#### Ví dụ coverage analysis trong gate

| Priority | Required Coverage | Actual Coverage | Status                 |
| -------- | ----------------- | --------------- | ---------------------- |
| **P0**   | 100%              | 100%            | ✅ PASS                |
| **P1**   | 90%               | 100%            | ✅ PASS                |
| **P2**   | 50%               | 33%             | ⚠️ Below (acceptable)  |
| **P3**   | 20%               | 0%              | ✅ PASS (low priority) |

#### Ví dụ quality metrics

| Metric             | Threshold        | Actual      | Status |
| ------------------ | ---------------- | ----------- | ------ |
| P0/P1 Coverage     | P0=100%, P1>=90% | 100% / 100% | ✅     |
| Test Quality Score | >80              | 84          | ✅     |
| NFR Status         | PASS             | PASS        | ✅     |

### 14. Rule ra quyết định

Khi `decision_mode = "deterministic"`, TEA dùng các rule sau:

| P0 Coverage | P1 Coverage | Overall Coverage | Decision                      |
| ----------- | ----------- | ---------------- | ----------------------------- |
| 100%        | ≥90%        | ≥80%             | **PASS** ✅                   |
| 100%        | 80-89%      | ≥80%             | **CONCERNS** ⚠️               |
| <100%       | Any         | Any              | **FAIL** ❌                   |
| Any         | <80%        | Any              | **FAIL** ❌                   |
| Any         | Any         | <80%             | **FAIL** ❌                   |
| Any         | Any         | Any              | **WAIVED** ⏭️ (with approval) |

**Chi tiết:**

- **PASS**: P0=100%, P1≥90%, overall≥80%
- **CONCERNS**: P0=100%, P1 80-89%, overall≥80%
- **FAIL**: P0<100% hoặc P1<80% hoặc overall<80%

### 15. Ví dụ `CONCERNS`

```markdown
**Verdict:** CONCERNS ⚠️ - Proceed with monitoring

**Evidence:**

- P0 coverage: 100%
- P1 coverage: 85%
- Test quality: 78/100

**Mitigation:**

- 1 P1 requirement deferred
- Monitoring alerts configured
```

### 16. Ví dụ `FAIL`

```markdown
**Verdict:** FAIL ❌ - Cannot release

**Evidence:**

- P0 coverage: 60%
- Critical security vulnerability
- Test quality: 55/100

**Actions Required:**

1. Add missing login tests
2. Fix SQL injection
3. Re-run security scan
4. Re-run trace
```

## Bạn sẽ nhận được gì

### Phase 1

- Requirement-to-test mapping
- Coverage classification: FULL / PARTIAL / NONE
- Gap identification
- Recommendation có thể hành động

### Phase 2

- Go/no-go verdict
- Evidence summary
- Approval hoặc waiver context
- Next steps và monitoring plan

## Pattern sử dụng theo loại dự án

### Greenfield

**Phase 3**

```text
After architecture complete:
1. Run test-design
2. Run trace Phase 1
3. Use for implementation-readiness gate
```

**Phase 4**

```text
After each epic/story:
1. Run trace Phase 1
2. Identify gaps
3. Add missing tests
```

**Release Gate**

```text
1. Run trace Phase 1
2. Run trace Phase 2
3. Get approvals
4. Deploy if PASS or WAIVED
```

### Brownfield

**Trước khi plan công việc mới:**

```text
1. Run trace Phase 1
2. Establish baseline
3. Understand existing coverage
```

**Trước release:**

```text
1. Run trace Phase 1
2. Run trace Phase 2
3. Compare with baseline
```

## Mẹo sử dụng

### Chạy Phase 1 thường xuyên

Đừng đợi tới release mới trace:

```text
After Story 1: trace Phase 1
After Story 2: trace Phase 1
Before Release: trace Phase 1 + Phase 2
```

### Đặt mục tiêu coverage theo priority

- **P0:** 100%
- **P1:** 90%
- **P2:** 50%
- **P3:** 20%

### Dùng FULL / PARTIAL / NONE một cách chiến lược

- **FULL**: item được test đầy đủ
- **PARTIAL**: mới test một phần
- **NONE**: chưa có test

### Tự động hóa gate trong CI

Ví dụ:

```yaml
- name: Check coverage
  run: |
    if [ $P0_COVERAGE -lt 100 ]; then exit 1; fi
    if [ $P1_COVERAGE -lt 80 ]; then exit 1; fi
    if [ $OVERALL_COVERAGE -lt 80 ]; then exit 1; fi
```

### Ghi waiver rõ ràng

Nếu phải dùng `WAIVED`, cần ghi:

- Ai phê duyệt
- Lý do business
- Điều kiện đi kèm
- Rủi ro chấp nhận
- Kế hoạch xử lý sau đó

## Vấn đề thường gặp

### Có quá nhiều gap

Đừng sửa tất cả cùng lúc:

1. Sửa P0 trước
2. Sửa P1 rủi ro cao
3. P2/P3 có thể defer

### Không map được test với requirement

Giải pháp:

- Thêm comment traceability trong test
- Hoặc thêm mã requirement vào tên test

Ví dụ:

```typescript
test('[REQ-1] should display profile', async ({ page }) => {
  // ...
});
```

### Khó phân biệt FULL và PARTIAL

**FULL:** tất cả acceptance criteria của item đều được test  
**PARTIAL:** mới bao phủ một phần acceptance criteria

### Không rõ nên chọn PASS hay CONCERNS

**Dùng PASS khi:**

- P0 đạt 100%
- P1 >90%
- Không có issue nghiêm trọng

**Dùng CONCERNS khi:**

- P1 ở mức 80-89%
- Có issue nhỏ nhưng có mitigation

**Dùng FAIL khi:**

- P0 <100%
- P1 <80%
- Có blocker bảo mật hoặc hiệu năng nghiêm trọng

## Tài liệu liên quan

- [How to Run Test Design](/vi-vn/how-to/workflows/run-test-design.md)
- [How to Run Test Review](/vi-vn/how-to/workflows/run-test-review.md)
- [How to Run NFR Assessment](/vi-vn/how-to/workflows/run-nfr-assess.md)

## Hiểu thêm về khái niệm

- [Risk-Based Testing](/vi-vn/explanation/risk-based-testing.md)
- [TEA Overview](/vi-vn/explanation/tea-overview.md)

## Tham chiếu

- [Command: \*trace](/vi-vn/reference/commands.md#trace)
- [TEA Configuration](/vi-vn/reference/configuration.md)

---

Tạo bằng [BMad Method](https://bmad-method.org) - TEA (Test Engineering Architect)
