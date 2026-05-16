---
title: 'Mở rộng TEA bằng workflow tùy chỉnh'
description: Thêm workflow riêng vào bmad-tea mà không phải vá trực tiếp TEA core
---

# Mở rộng TEA bằng workflow tùy chỉnh

TEA hiện là một module độc lập. Điều đó có nghĩa là custom workflow vẫn được hỗ trợ, nhưng chúng sẽ **không tự động được gộp vào TEA core** sau mỗi lần cập nhật. Cách an toàn là mở rộng qua cơ chế customization thay vì patch trực tiếp core.

## Mô hình được hỗ trợ

Bạn nên dùng một trong các cách sau:

1. Đóng gói workflow thành custom content hoặc custom module
2. Thêm menu entry vào `bmad-tea` thông qua BMAD agent customization
3. Cài lại hoặc quick-update BMAD để workflow và menu entry được đăng ký lại

Cách này giúp extension của bạn vẫn tương thích với cập nhật từ upstream.

## Cách làm khuyến nghị

### 1. Tạo workflow như custom content

Dùng BMad Builder hoặc cấu trúc custom module của riêng bạn để tạo workflow sống **ngoài TEA core**.

- BMAD hỗ trợ custom module trong lúc cài đặt hoặc update
- BMad Builder là con đường khuyến nghị để tạo agent và workflow có thể tái sử dụng

Xem thêm:

- [How to Customize BMad](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/docs/how-to/customize-bmad.md)
- [BMad Builder (BMB)](https://github.com/bmad-code-org/bmad-builder)

### 2. Gắn workflow vào `bmad-tea`

Sau khi TEA được cài, dùng file agent customization sinh ra cho `bmad-tea` trong `_bmad/_config/agents/` rồi thêm menu item:

```yaml
menu:
  - trigger: my-custom-workflow
    workflow: 'my-custom/workflows/my-custom-workflow.yaml'
    description: My custom TEA extension workflow
```

Cách này giữ nguyên trải nghiệm menu/chat của `bmad-tea`, nhưng vẫn route sang workflow tùy chỉnh của bạn.

### 3. Cài lại hoặc quick-update BMAD

Chạy:

```bash
npx bmad-method install
```

Sau đó chọn đường cập nhật bình thường để BMAD áp lại customization và làm mới việc đăng ký workflow.

## Điều không nên làm

- Không patch trực tiếp file TEA core nếu workflow chỉ phục vụ một dự án cụ thể
- Không dựa vào hành vi cũ kiểu embedded-TEA, nơi workflow local tự xuất hiện như gắn sẵn
- Không để toàn bộ logic custom workflow chỉ nằm trong chat instructions; hãy đặt nó vào workflow hoặc module thật

## Khi nào nên chọn cách nào

- **Workflow theo dự án cụ thể:** thêm custom content rồi gắn vào `bmad-tea`
- **Workflow nội bộ có thể tái sử dụng:** đóng gói thành custom module
- **Workflow công khai có thể tái dùng rộng hơn:** cân nhắc publish như một BMAD module độc lập

## Gợi ý cho QC

Các khu vực đáng cân nhắc mở rộng:

- compliance testing
- domain data validation
- environment readiness
- specialized regression audit
- release evidence packaging

## Tài liệu liên quan

- [TEA Command Reference](/docs/vi-vn/reference/commands.md)
- [TEA Configuration Reference](/docs/vi-vn/reference/configuration.md)
- [How to Customize BMad](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/docs/how-to/customize-bmad.md)

---

Được tạo bằng [BMad Method](https://bmad-method.org) - TEA (Test Engineering Architect)
