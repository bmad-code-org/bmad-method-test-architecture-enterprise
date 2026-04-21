---
title: Chào mừng
description: Test Architect (TEA) - quy trình kiểm thử dựa trên rủi ro, hướng dẫn tự động hóa và cổng quyết định phát hành cho BMad Method
---

# Test Architect (TEA)

## TEA là gì?

TEA (Test Engineering Architect) là một module của BMAD dành cho chiến lược kiểm thử và tự động hóa. Bộ công cụ này cung cấp 9 workflow bao phủ các hoạt động học tập, thiết lập, thiết kế, tự động hóa, review và ra quyết định phát hành.

- **Vận hành theo workflow**: Nhiều workflow phù hợp với công việc hằng ngày của Test Architect.
- **Đầu ra nhất quán**: Hướng dẫn từ knowledge base giúp duy trì tiêu chuẩn thống nhất, bất kể bạn đang dùng agent nào.
- **Dựa trên rủi ro**: Ưu tiên P0-P3 theo công thức xác suất × tác động.
- **Cổng phát hành**: Quyết định go/no-go có thể truy vết và có bằng chứng hỗ trợ.

## Cài đặt nhanh

```bash
npx bmad-method install
# Chọn: Test Architect (TEA)
```

Sau đó kích hoạt workflow qua chat:

```text
bmad-tea    # Nạp agent/menu TEA
test-design # Chạy workflow Test Design
```

## Bắt đầu

Chọn lộ trình phù hợp:

- **Mới làm quen với kiểm thử?** Bắt đầu với [TEA Academy](/vi-vn/tutorials/learn-testing-tea-academy) - học kiểm thử từ nền tảng đến nâng cao (7 buổi, 1-2 tuần)
- **TEA Lite**: Bắt đầu với [Test Automation](/vi-vn/how-to/workflows/run-automate) trong khoảng 30 phút
- **Full TEA**: Đọc [TEA Overview](/vi-vn/explanation/tea-overview) để xem toàn bộ bản đồ workflow
- **Enterprise**: Chọn [Greenfield](/vi-vn/how-to/brownfield/use-tea-for-enterprise) hoặc [Brownfield](/vi-vn/how-to/brownfield/use-tea-with-existing-tests)
- **Mở rộng tùy chỉnh**: Xem [Extend TEA with Custom Workflows](/vi-vn/how-to/customization/extend-tea-with-custom-workflows)

## Workflow cốt lõi

| Workflow                                                        | Trigger | Mục đích                                     |
| --------------------------------------------------------------- | ------- | -------------------------------------------- |
| [Teach Me Testing](/vi-vn/how-to/workflows/teach-me-testing)    | TMT     | Học kiểm thử qua 7 buổi                      |
| [Framework Setup](/vi-vn/how-to/workflows/setup-test-framework) | TF      | Khởi tạo test framework                      |
| [CI/CD Integration](/vi-vn/how-to/workflows/setup-ci)           | CI      | Thiết lập pipeline chất lượng                |
| [Test Design](/vi-vn/how-to/workflows/run-test-design)          | TD      | Lập kế hoạch kiểm thử dựa trên rủi ro        |
| [ATDD](/vi-vn/how-to/workflows/run-atdd)                        | AT      | Viết acceptance test thất bại trước theo TDD |
| [Test Automation](/vi-vn/how-to/workflows/run-automate)         | TA      | Mở rộng độ bao phủ tự động hóa               |
| [Test Review](/vi-vn/how-to/workflows/run-test-review)          | RV      | Đánh giá chất lượng có chấm điểm             |
| [Requirements Tracing](/vi-vn/how-to/workflows/run-trace)       | TR      | Ánh xạ độ bao phủ và quyết định gate         |
| [NFR Assessment](/vi-vn/how-to/workflows/run-nfr-assess)        | NR      | Đánh giá yêu cầu phi chức năng               |

## Cấu trúc tài liệu

- **[Tutorial](/vi-vn/tutorials/tea-lite-quickstart/)**: Học TEA theo từng bước
- **[How-To Guides](/vi-vn/how-to/workflows/run-test-design)**: Hướng dẫn theo tác vụ
- **[Explanation](/vi-vn/explanation/testing-as-engineering/)**: Giải thích khái niệm và kiến trúc
- **[Reference](/vi-vn/reference/commands)**: Lệnh, cấu hình, knowledge base
- **[Glossary](/vi-vn/glossary)**: Thuật ngữ và định nghĩa

## Hỗ trợ

- **Issues**: [GitHub Issues](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/issues)
