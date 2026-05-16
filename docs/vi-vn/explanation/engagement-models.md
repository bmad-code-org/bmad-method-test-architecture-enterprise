---
title: 'Giải thích các mô hình engagement của TEA'
description: Hiểu 5 cách dùng TEA, từ standalone tới tích hợp đầy đủ với BMad Method
---

# Giải thích các mô hình engagement của TEA

TEA là tùy chọn và linh hoạt. Có **5 cách hợp lệ** để dùng TEA, và bạn nên chọn có chủ đích dựa trên bối cảnh dự án thay vì mặc định áp một mô hình cho mọi nơi.

## Tổng quan

**TEA không bắt buộc.** Hãy chọn mô hình phù hợp với thực tế dự án:

1. **No TEA** - bỏ qua toàn bộ workflow của TEA
2. **TEA Solo** - dùng TEA độc lập, không cần full BMad Method
3. **TEA Lite** - lối vào cho người mới, chủ yếu dùng `automate`
4. **TEA Integrated (Greenfield)** - tích hợp TEA trọn vẹn cho dự án mới
5. **TEA Integrated (Brownfield)** - tích hợp TEA trên codebase hiện có

## Vấn đề

### Cách tiếp cận one-size-fits-all không hiệu quả

Các công cụ testing truyền thống thường ép một cách dùng duy nhất:

- Phải dùng cả framework
- Áp dụng kiểu all-or-nothing
- Không linh hoạt theo loại dự án
- Nếu không khớp thực tế, team bỏ luôn công cụ

TEA đi theo hướng khác:

- Dự án khác nhau có nhu cầu khác nhau
- Độ trưởng thành của team khác nhau
- Bối cảnh greenfield và brownfield không giống nhau
- Tăng tính linh hoạt giúp tăng khả năng adoption

## Năm mô hình engagement

### Mô hình 1: No TEA

**Là gì:** bỏ qua mọi workflow TEA, tiếp tục cách testing hiện tại.

**Khi nào nên dùng:**

- Team đã có thực hành testing rất ổn định
- Chất lượng hiện tại đã cao
- Toolchain đang dùng đã giải quyết tốt vấn đề
- TEA không tạo thêm giá trị đáng kể

**Những gì bạn bỏ lỡ:**

- Lập kế hoạch test theo rủi ro
- Review test có hệ thống
- Gate decision có bằng chứng
- Pattern thống nhất từ knowledge base

**Những gì bạn giữ được:**

- Toàn quyền kiểm soát
- Tool hiện có
- Chuyên môn nội bộ
- Không có learning curve mới

**Ví dụ:**

```text
Team của bạn:
- QA team dày kinh nghiệm
- Test practice đã thành chuẩn nội bộ
- Suite chất lượng cao
- Không có pain point rõ ràng

Quyết định: không dùng TEA
```

**Kết luận:** đây là một lựa chọn hoàn toàn hợp lệ nếu hệ hiện tại đang vận hành tốt.

---

### Mô hình 2: TEA Solo

**Là gì:** dùng workflow TEA độc lập mà không cần full BMad Method.

**Khi nào nên dùng:**

- Dự án không theo BMad
- Chỉ muốn mô hình vận hành chất lượng của TEA
- Không cần toàn bộ planning workflow của BMad
- Có thể tự cung cấp requirements, spec hoặc source tree phân tích được

**Trình tự điển hình:**

```text
1. test-design
2. atdd hoặc automate
3. test-review (tùy chọn)
4. trace
```

**Bạn cần tự mang theo:**

- coverage oracle hoặc tài liệu yêu cầu
- môi trường phát triển và hệ thống chạy test
- context dự án

**TEA cung cấp:**

- test planning theo rủi ro
- sinh test
- review chất lượng
- traceability và gate decision

**Tùy chọn thêm:**

- `framework` nếu muốn scaffold test harness
- `ci` nếu muốn sinh pipeline CI/CD

**Ví dụ:**

```text
Bạn đang dùng Scrum, quản lý story bằng Jira, không chạy theo BMad.

Luồng làm việc:
1. Export story từ Jira
2. Chạy test-design cho epic
3. Chạy atdd cho từng story
4. DEV implement
5. Chạy trace để xem độ phủ và gate
```

**Kết luận:** phù hợp với team muốn lấy lợi ích của TEA mà không cần cam kết toàn bộ phương pháp BMad.

---

### Mô hình 3: TEA Lite

**Là gì:** cách vào đơn giản nhất cho người mới, chủ yếu dùng `automate` để test feature đã tồn tại.

**Khi nào nên dùng:**

- Đang học nền tảng TEA
- Muốn thấy kết quả nhanh
- Đang test ứng dụng sẵn có
- Chưa có thời gian đi full methodology

**Workflow điển hình:**

```text
1. framework
2. test-design (tùy chọn)
3. automate
4. chạy test, test pass ngay
```

**Ví dụ:**

```text
Developer mới:
- Chưa từng dùng TEA
- Muốn thêm test cho app hiện có
- Chỉ có khoảng 30 phút

Các bước:
1. Chạy framework
2. Chạy automate trên một feature/demo
3. Có test được sinh ra và chạy pass
4. Nắm được các khái niệm TEA cơ bản
```

**Bạn nhận được:**

- Một test framework hoạt động được
- Test pass cho feature hiện có
- Trải nghiệm học nhanh
- Nền tảng để mở rộng dần

**Những gì còn thiếu:**

- Luồng TDD kiểu `atdd`
- Risk-based planning sâu
- Gate decision hoàn chỉnh của `trace`
- Toàn bộ capability của TEA

**Kết luận:** đây là điểm khởi đầu rất hợp lý cho người mới.

---

### Mô hình 4: TEA Integrated (Greenfield)

**Là gì:** tích hợp đầy đủ TEA vào các pha của BMad Method cho dự án mới.

**Khi nào nên dùng:**

- Dự án mới bắt đầu từ đầu
- Đang dùng BMad Method hoặc Enterprise track
- Muốn có quality operating model trọn vẹn
- Testing ảnh hưởng trực tiếp đến thành công dự án

**Lifecycle điển hình:**

**Phase 2: Planning**

- PM tạo PRD với FR và NFR
- Có thể chạy `nfr-assess` nếu cần

**Phase 3: Solutioning**

- Architect tạo architecture
- TEA chạy `test-design` ở mức hệ thống
- TEA chạy `framework`
- TEA chạy `ci`
- Kiểm tra implementation-readiness

**Phase 4: Implementation theo từng epic**

- SM chạy `sprint-planning`
- TEA chạy `test-design` cho epic hiện tại
- SM tạo stories
- Có thể chạy `atdd` trước khi dev
- DEV implement
- TEA chạy `automate`
- Có thể chạy `test-review`
- TEA chạy `trace` Phase 1 để cập nhật coverage

**Release gate**

- Có thể chạy `test-review` lần cuối
- Có thể chạy `nfr-assess`
- Chạy `trace` Phase 2 để ra quyết định `PASS / CONCERNS / FAIL / WAIVED`

**Bạn nhận được:**

- mô hình chất lượng đầy đủ
- planning có ưu tiên theo rủi ro
- pattern nhất quán giữa các epic
- gate decision dựa trên bằng chứng

**Kết luận:** đây là cách dùng đầy đủ và mạnh nhất, phù hợp team có quy trình bài bản.

---

### Mô hình 5: TEA Integrated (Brownfield)

**Là gì:** tích hợp TEA vào codebase sẵn có, tập trung vào regression risk và integration risk.

**Khi nào nên dùng:**

- Có codebase cũ hoặc đang vận hành
- Cần giữ regression dưới kiểm soát
- Có nhiều phụ thuộc, nhiều module cũ mới đan xen
- Muốn tăng dần chất lượng thay vì làm lại từ đầu

**Lifecycle điển hình:**

**Documentation / baseline**

- Có thể cần `document-project` nếu dự án thiếu tài liệu
- Chạy `trace` sớm để lấy baseline coverage hiện có

**Phase 3: Solutioning**

- system-level `test-design`
- `framework`
- `ci`

**Phase 4: Per epic**

- `test-design` tập trung hotspot và regression
- có thể chạy `atdd`
- `automate`
- `test-review`
- `trace`

**Release gate**

- `trace` Phase 2
- `nfr-assess` nếu chưa chạy trước đó

**Khác biệt lớn so với greenfield:**

- Tập trung vào vùng rủi ro do code cũ
- Cần baseline trước khi mở rộng coverage
- Test design phải tính đến integration seam và side effect

**Kết luận:** đây là mô hình phù hợp nhất khi mục tiêu là cải thiện chất lượng trên hệ thống đang sống.

---

## Cách chọn mô hình phù hợp

### Chọn `No TEA` nếu

- hệ hiện tại đã rất hiệu quả
- không có pain point thật sự về test
- team không cần thêm structure mới

### Chọn `TEA Solo` nếu

- muốn dùng TEA ngoài BMad
- đã có tài liệu yêu cầu riêng
- cần planning và review tốt hơn nhưng không muốn đổi methodology tổng

### Chọn `TEA Lite` nếu

- đang học
- cần kết quả nhanh
- muốn có test pass sớm cho feature hiện có

### Chọn `Integrated Greenfield` nếu

- dự án mới
- cần quality gate rõ ràng
- muốn đưa testability vào từ đầu

### Chọn `Integrated Brownfield` nếu

- đang nâng cấp hệ thống hiện có
- sợ regression
- cần quản trị coverage và release gate có bằng chứng

## Điều này quan trọng thế nào với QC

Với QC, engagement model quyết định:

- mức độ TEA can thiệp vào quy trình hằng ngày
- độ sâu của planning và review
- cách team dùng test như artifact kỹ thuật hay chỉ như output cuối cùng
- khối lượng bằng chứng cần chuẩn bị cho gate và release

## Tài liệu liên quan

- [TEA overview](/docs/vi-vn/explanation/tea-overview.md)
- [Risk-based testing](/docs/vi-vn/explanation/risk-based-testing.md)
- [Cách chạy test-design](/docs/vi-vn/how-to/workflows/run-test-design.md)
- [Cách chạy automate](/docs/vi-vn/how-to/workflows/run-automate.md)
- [Cách chạy trace](/docs/vi-vn/how-to/workflows/run-trace.md)

## Kết luận

Giá trị của TEA không chỉ nằm ở số workflow nó có, mà ở chỗ bạn có thể dùng nó theo đúng độ chín của team và đúng mức độ kiểm soát mà dự án cần.

---

Được tạo bằng [BMad Method](https://bmad-method.org) - TEA (Test Engineering Architect)
