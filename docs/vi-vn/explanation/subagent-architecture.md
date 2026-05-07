---
title: Kiến trúc subagent
description: Cách TEA dùng subagent và agent team trong các workflow
---

# Kiến trúc subagent và agent team trong TEA

Tài liệu này giải thích cách TEA điều phối công việc khi một workflow có thể tách thành các worker step độc lập hoặc các đơn vị công việc có phụ thuộc.

## Phạm vi áp dụng

Áp dụng cho các workflow:

- `automate`
- `atdd`
- `test-review`
- `nfr-assess`
- `framework`
- `ci`
- `test-design`
- `trace`

Không áp dụng cho `teach-me-testing`.

---

## Mô hình lõi

TEA orchestration có 3 phần:

1. Xác định execution mode, dựa trên `tea_execution_mode` và runtime probe nếu có
2. Dispatch worker steps, có thể độc lập hoặc có thứ tự phụ thuộc
3. Aggregate output của worker thành artifact cuối cùng có tính xác định

Worker được cô lập với nhau và trao đổi dữ liệu qua output có cấu trúc để bước aggregate có thể validate.

## Execution modes

TEA hỗ trợ 4 mode:

- `auto`
- `agent-team`
- `subagent`
- `sequential`

### Ý nghĩa từng mode

- `auto`: chọn mode tốt nhất runtime hỗ trợ
- `agent-team`: ưu tiên orchestration theo team/delegation
- `subagent`: ưu tiên worker cô lập
- `sequential`: chạy tuần tự từng bước

### Fallback behavior

Khi `tea_capability_probe: true`:

- `auto` fallback theo thứ tự `agent-team -> subagent -> sequential`
- `agent-team` hoặc `subagent` có thể rơi về mode khả dụng tiếp theo
- `sequential` luôn giữ nguyên tuần tự

Khi `tea_capability_probe: false`, TEA tôn trọng mode yêu cầu nghiêm ngặt hơn và có thể fail nếu runtime không hỗ trợ.

### Runtime scheduling

Trong `agent-team` và `subagent`, runtime quyết định mức song song và lịch chạy. TEA không tự áp trần worker song song riêng.

## Override bằng câu lệnh người dùng

Trong một lần chạy, cách người dùng diễn đạt có thể override config cho đúng lần đó.

Các từ được normalize:

- `agent team`, `agent teams`, `agentteam` → `agent-team`
- `subagent`, `subagents`, `sub agent` → `subagent`
- `sequential` → `sequential`
- `auto` → `auto`

Thứ tự ưu tiên:

1. Yêu cầu explicit ở lần chạy hiện tại
2. `tea_execution_mode` trong config
3. Runtime fallback nếu bật probing

## Bản đồ áp dụng theo workflow

### `automate`

- Tách worker: sinh API test và E2E/backend test
- Aggregate: gộp test sinh ra, fixture và số liệu tóm tắt
- Mode chỉ đổi orchestration style, không đổi output contract

### `atdd`

- Tách worker: sinh failing API tests và failing E2E tests
- Aggregate: kiểm tra output red-phase và gộp artifact

### `test-review`

- Tách worker theo từng quality dimension như determinism, isolation, maintainability, performance
- Aggregate: tính score và report chung

### `nfr-assess`

- Tách worker cho security, performance, reliability, scalability
- Aggregate: tổng hợp risk, compliance summary và priority actions

### `framework`

- Tách worker cho scaffold cấu trúc, config, fixture, sample
- Aggregate: gộp các đầu ra setup

### `ci`

- Có khả năng dùng orchestration mode khi sinh pipeline
- Artifact cuối vẫn là một pipeline mang tính xác định

### `test-design`

- Có thể chia thành work unit phục vụ sinh output thiết kế
- Schema đầu ra không đổi theo mode

### `trace`

- Tách theo phase hoặc work unit có phụ thuộc
- Aggregate coverage, gap analysis và gate data

## Các guarantee về thiết kế

TEA giữ nguyên các guarantee này ở mọi mode:

- cùng output schema cho một workflow
- cùng logic validate và aggregate
- cùng semantics fallback có tính xác định
- cùng failure behavior khi worker output thiếu hoặc không hợp lệ

Mode chỉ đổi cách điều phối, không đổi hợp đồng đầu ra.

## Hướng dẫn thực hành

**Khuyến nghị mặc định:**

```yaml
tea_execution_mode: 'auto'
tea_capability_probe: true
```

Dùng `sequential` khi:

- cần debug rõ từng bước
- cần chạy một luồng đơn
- muốn đơn giản hóa troubleshooting

Dùng explicit `agent-team` hoặc `subagent` khi:

- bạn cố ý muốn mode đó
- hiểu runtime hiện tại có hỗ trợ hay không

## Tín hiệu troubleshooting

Các nguyên nhân gây nhầm lẫn thường gặp:

- có explicit override ở lần chạy hiện tại
- runtime không hỗ trợ mode được yêu cầu nên phải fallback
- probe bị tắt trong khi mode explicit không khả dụng

Hãy kiểm tra log resolved mode trong execution report để biết workflow thực sự đã chạy bằng mode nào.

## Điều này quan trọng thế nào với QC

Với QC, subagent architecture quan trọng vì:

- giải thích vì sao cùng một workflow có thể chạy nhanh hơn ở môi trường hỗ trợ delegation
- giúp hiểu output vẫn nên nhất quán dù orchestration thay đổi
- hỗ trợ debug khi report cuối cùng có dấu hiệu thiếu artifact từ một worker

## Tài liệu liên quan

- [Kiến trúc step-file](/docs/vi-vn/explanation/step-file-architecture.md)
- [TEA overview](/docs/vi-vn/explanation/tea-overview.md)
- [Cách chạy automate](/docs/vi-vn/how-to/workflows/run-automate.md)
- [Cách chạy atdd](/docs/vi-vn/how-to/workflows/run-atdd.md)
- [Cách chạy trace](/docs/vi-vn/how-to/workflows/run-trace.md)

## Kết luận

Subagent architecture cho phép TEA song song hóa phần việc khi có thể, nhưng vẫn giữ output contract ổn định. Đó là điểm quan trọng để tăng tốc mà không đánh đổi tính nhất quán của artifact đầu ra.
