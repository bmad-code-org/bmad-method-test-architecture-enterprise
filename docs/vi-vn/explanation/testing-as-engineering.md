---
title: 'Kiểm thử như một hoạt động kỹ thuật'
description: Vì sao TEA xem kiểm thử là công việc kỹ thuật có thiết kế, có kiến trúc và có tiêu chuẩn vận hành
---

# Kiểm thử như một hoạt động kỹ thuật

TEA được xây dựng trên quan điểm rằng kiểm thử không chỉ là viết case hay chạy regression, mà là một hoạt động kỹ thuật có mục tiêu, có thiết kế và có tiêu chuẩn chất lượng.

## Vấn đề TEA muốn giải quyết

Nhiều bộ test do AI hoặc do đội dự án tạo nhanh thường gặp các vấn đề:

- Phụ thuộc mạnh vào UI và selector dễ vỡ
- Không có chiến lược ưu tiên theo rủi ro
- Chạy không ổn định, nhiều flaky test
- Trùng lặp coverage nhưng vẫn bỏ sót lỗ hổng quan trọng
- Khó review, khó truy vết và khó dùng cho gate release

TEA giải quyết các vấn đề này bằng cách chuẩn hóa cách thiết kế, tổ chức và đánh giá test.

## Các nguyên tắc cốt lõi

### 1. Ưu tiên theo rủi ro

Không phải mọi hành vi đều có giá trị như nhau. Những luồng có xác suất lỗi cao hoặc tác động lớn cần được ưu tiên trước bằng P0-P3.

### 2. Thiết kế trước khi tự động hóa

Không viết test trước khi hiểu hệ thống cần bao phủ cái gì. `test-design` luôn là đầu vào quan trọng cho `atdd` và `automate`.

### 3. Tính ổn định quan trọng hơn số lượng

Một bộ test nhỏ nhưng ổn định, có tín hiệu rõ ràng, luôn tốt hơn một bộ test lớn nhưng nhiều nhiễu và khó tin cậy.

### 4. Khả năng truy vết là bắt buộc

Mỗi yêu cầu, acceptance criteria hoặc rủi ro quan trọng cần có cách ánh xạ tới test, bằng chứng hoặc waiver tương ứng.

### 5. Kiểm thử là một phần của kiến trúc

Fixture, data factory, network strategy, selector strategy và CI pipeline đều là thành phần kiến trúc test, không phải việc bổ sung sau cùng.

## TEA định nghĩa chất lượng test như thế nào

Một test tốt trong TEA cần:

- Có mục đích rõ ràng
- Bao phủ đúng rủi ro
- Dễ đọc, dễ review
- Chạy ổn định
- Cô lập dữ liệu và môi trường hợp lý
- Hỗ trợ chẩn đoán khi fail
- Có thể duy trì trong thời gian dài

## Hệ quả trong thực tế cho QC

Khi áp dụng TEA, đội QC thường thay đổi cách làm ở các điểm sau:

- Không bắt đầu bằng “viết thật nhiều test”
- Bắt đầu bằng phân tích rủi ro và coverage strategy
- Xem xét testability ngay từ lúc đọc architecture hoặc PRD
- Dùng review chất lượng test như một hoạt động kỹ thuật chính thức
- Dùng traceability và gate để ra quyết định phát hành dựa trên bằng chứng

## Cách TEA đưa nguyên tắc vào workflow

- `test-design`: xác định rủi ro, vùng cần bao phủ và mức ưu tiên
- `atdd`: tạo acceptance test ở pha đỏ trước khi code hoàn chỉnh
- `automate`: mở rộng coverage sau implementation
- `test-review`: kiểm tra chất lượng của chính bộ test
- `trace`: xác nhận coverage và hỗ trợ gate decision
- `nfr-assess`: đánh giá góc nhìn phi chức năng

## Điều cần tránh

- Test chỉ mô phỏng happy path
- Chạy E2E cho mọi thứ thay vì phân tầng hợp lý
- Phụ thuộc selector mong manh
- Thiếu fixture và data strategy
- Không có tiêu chí rõ ràng để PASS/FAIL release

## Tóm tắt

TEA xem kiểm thử là một hệ thống kỹ thuật hoàn chỉnh. Điều này đặc biệt phù hợp với QC trong môi trường enterprise, nơi độ tin cậy, khả năng review, truy vết và bằng chứng phát hành quan trọng không kém số lượng test.
