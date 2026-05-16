---
title: 'Cách học kiểm thử với TEA Academy'
description: Trợ lý học tập nhiều buổi, dạy kiểm thử từ cơ bản đến nâng cao và có lưu trạng thái
---

# Cách học kiểm thử với TEA Academy

Dùng workflow `teach-me-testing` của TEA để học kiểm thử theo tiến trình qua 7 buổi có cấu trúc. Workflow này được thiết kế cho việc tự học trong 1-2 tuần với khả năng tự động theo dõi tiến độ.

## Khi nào nên dùng

- **QA mới:** onboarding đầy đủ về các nền tảng kiểm thử
- **Developer:** học testing theo góc nhìn tích hợp
- **Team lead:** hiểu pattern kiến trúc và thực hành của đội
- **VP/Manager:** nắm chiến lược kiểm thử và quality metrics
- **Bất kỳ ai:** muốn học testing mà không cần instructor đi kèm

**Rất phù hợp cho:**

- Onboarding trong công ty
- Tự học với khả năng pause và resume bất cứ lúc nào
- Khám phá không tuyến tính theo mức kinh nghiệm
- Xây nền tảng testing có thể mở rộng lâu dài

## Bạn sẽ học được gì

### 7 buổi học tăng tiến

1. **Khởi động nhanh (30 phút)** - giới thiệu TEA Lite, hiểu engagement models
2. **Khái niệm cốt lõi (45 phút)** - risk-based testing (P0-P3), Definition of Done
3. **Kiến trúc & patterns (60 phút)** - fixtures, network-first patterns, data factories
4. **Test Design (60 phút)** - workflow đánh giá rủi ro và lập kế hoạch coverage
5. **ATDD & Automate (60 phút)** - cách tiếp cận TDD red-green, test generation
6. **Quality & Trace (45 phút)** - test review, coverage traceability
7. **Pattern nâng cao (liên tục)** - khám phá 42 knowledge fragments theo nhu cầu

### Giá trị bạn nhận được

- Nền tảng testing quan trọng như risk-based testing, test pyramid và các loại test
- Hiểu phương pháp TEA với 9 workflow và các pattern kiến trúc
- Kỹ năng thực hành để viết test tốt đầu tiên của bạn
- Artifact học tập như session notes và completion certificate
- Sự tự tin để áp dụng TEA vào dự án thực tế

## Điều kiện tiên quyết

- Đã cài BMad Method với module TEA
- Có quyền truy cập tài liệu và knowledge base của TEA
- Mỗi buổi có 30-90 phút học tập, có thể pause và resume
- Sẵn sàng học tăng tiến trong 1-2 tuần

## Cách hoạt động

### Bắt đầu từ đầu

Mở một chat mới và nạp TEA:

```text
tea
```

Sau đó chọn Teach Me Testing:

```text
TMT
```

Hoặc gọi trực tiếp:

```text
teach-me-testing
```

### Đánh giá ban đầu

Workflow sẽ hỏi:

- **Vai trò của bạn:** QA, Dev, Lead hoặc VP để tùy biến ví dụ
- **Mức kinh nghiệm:** beginner, intermediate hoặc experienced
- **Mục tiêu học tập:** bạn muốn đạt được điều gì
- **Pain points:** thách thức testing hiện tại, nếu có

### Session menu

Sau phần đánh giá, bạn sẽ thấy menu của cả 7 session cùng với:

- Buổi đã hoàn thành kèm điểm số
- Buổi đang học
- Buổi chưa bắt đầu
- Tỷ lệ hoàn thành
- Buổi được đề xuất tiếp theo

**Bạn có thể nhảy tới bất kỳ session nào** chứ không bị khóa theo đường tuyến tính.

### Luồng của mỗi buổi

1. **Teaching** - trình bày khái niệm kèm ví dụ phù hợp vai trò
2. **Quiz** - 3 câu hỏi để kiểm tra hiểu bài, cần **>= 70%** để vượt qua
3. **Session Notes** - sinh artifact ghi lại ý chính
4. **Progress Update** - tự động lưu, có thể dừng ở bất kỳ lúc nào
5. **Return to Menu** - chọn session tiếp theo hoặc thoát

## Theo dõi tiến độ

Tiến độ của bạn được lưu tự động:

- Progress file: `{test_artifacts}/teaching-progress/{your-name}-tea-progress.yaml`
- Session notes: `{test_artifacts}/tea-academy/{your-name}/session-{N}-notes.md`
- Certificate: `{test_artifacts}/tea-academy/{your-name}/tea-completion-certificate.md` sau khi xong cả 7 buổi

### Tiếp tục sau

Chỉ cần chạy lại workflow. TEA sẽ tự phát hiện tiến độ cũ và hiển thị đúng điểm bạn đang dở.

## Lộ trình học theo kinh nghiệm

### Người mới

**Lộ trình đề xuất:** Buổi 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7

Bắt đầu từ Buổi 1 và đi tuần tự. Mỗi buổi xây trên nền của buổi trước.

**Thời lượng:** 1-2 tuần, 30-90 phút mỗi buổi

### Trung cấp

**Lộ trình đề xuất:** Buổi 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7

Bạn có thể đi nhanh qua Buổi 1-2 và tập trung hơn vào Buổi 3-6.

**Thời lượng:** khoảng 1 tuần, có thể bỏ qua chủ đề đã quen

### Người có kinh nghiệm

**Lộ trình đề xuất:** vào thẳng Buổi 3, 4, 7

Bỏ qua phần nhập môn và tập trung vào:

- Buổi 3: pattern kiến trúc của TEA
- Buổi 4: workflow Test Design
- Buổi 7: pattern nâng cao qua 42 knowledge fragments

**Thời lượng:** khoảng 3-4 giờ, rất tập trung

## Nội dung từng buổi

### Buổi 1: Khởi động nhanh

- TEA là gì và vì sao nó tồn tại
- Cách tiếp cận TEA Lite
- Engagement models
- Tổng quan workflow `automate`

### Buổi 2: Khái niệm cốt lõi

- Triết lý testing as engineering
- Risk-based testing
- Chấm điểm Probability × Impact
- Definition of Done với 7 nguyên tắc chất lượng

### Buổi 3: Kiến trúc & patterns

- Fixture composition patterns
- Network-first patterns để tránh race condition
- Data factories
- Step-file architecture

### Buổi 4: Test Design

- Workflow Test Design
- Đánh giá risk/testability
- Coverage planning ở các mức unit/integration/E2E
- Test priorities matrix (mục tiêu coverage P0-P3)

### Buổi 5: ATDD & Automate

- Workflow ATDD với failing tests first
- Vòng lặp TDD red-green-refactor
- Workflow `automate` để mở rộng coverage
- API testing patterns

### Buổi 6: Quality & Trace

- Workflow Test Review với các chiều chất lượng
- Coverage traceability
- Quality metrics có ý nghĩa
- Release gate decisions

### Buổi 7: Pattern nâng cao

- Khám phá 42 knowledge fragments theo nhu cầu
- Đào sâu các pattern phù hợp bối cảnh của bạn
- Đối chiếu source trên GitHub khi cần

## Chứng nhận hoàn thành

Hoàn thành cả 7 buổi để nhận chứng nhận gồm:

- Ngày hoàn thành và điểm từng buổi
- Điểm trung bình
- Danh sách kỹ năng đã đạt được
- Đường dẫn tới các artifact học tập

## Mẹo để học tốt

1. Dành thời gian riêng cho từng buổi
2. Ghi thêm note cá nhân song song với note tự động
3. Áp dụng ngay vào dự án hiện tại
4. Dùng Buổi 7 để đào sâu chủ đề đang cần gấp
5. Chia sẻ lại với đồng đội

## Tùy biến theo vai trò

- **QA Engineers:** ưu tiên workflow, coverage, metrics
- **Developers:** ưu tiên TDD, integration, API testing
- **Tech Leads:** ưu tiên architecture, standard đội nhóm, review
- **VPs/Managers:** ưu tiên strategy, ROI, scaling, quality metrics
