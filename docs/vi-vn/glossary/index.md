---
title: 'Thuật ngữ TEA'
description: Tài liệu thuật ngữ cho Test Architect (TEA)
---

Tài liệu tham chiếu thuật ngữ cho Test Architect (TEA).

## Khái niệm cốt lõi

| Thuật ngữ               | Định nghĩa                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Agent**               | Persona AI chuyên biệt với chuyên môn cụ thể như PM, Architect, SM, DEV, TEA; dùng để dẫn dắt workflow và tạo deliverable.         |
| **BMad**                | Breakthrough Method of Agile AI-Driven Development - framework agile do AI dẫn dắt với agent chuyên biệt và workflow có hướng dẫn. |
| **BMad Method**         | Phương pháp hoàn chỉnh cho phát triển phần mềm có AI hỗ trợ, bao gồm planning, architecture, implementation và quality workflow.   |
| **Workflow**            | Quy trình nhiều bước để điều phối hoạt động của agent và tạo đầu ra cụ thể.                                                        |
| **Context Engineering** | Cách nạp standards chuyên biệt vào AI context thông qua manifest để đầu ra ổn định hơn, ít phụ thuộc prompt wording.               |

## Quy mô và độ phức tạp

| Thuật ngữ                   | Định nghĩa                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Quick Flow Track**        | Track triển khai nhanh dùng tech-spec, phù hợp bug fix và thay đổi nhỏ, rõ phạm vi.                                |
| **BMad Method Track**       | Track planning đầy đủ dùng PRD + Architecture + UX, phù hợp sản phẩm và tính năng phức tạp hơn.                    |
| **Enterprise Method Track** | Track mở rộng thêm Security Architecture, DevOps Strategy và Test Strategy, phù hợp compliance và hệ nhiều tenant. |
| **Planning Track**          | Con đường phương pháp được chọn dựa trên nhu cầu planning và độ phức tạp, không chỉ dựa vào số lượng story.        |

## Tài liệu planning

| Thuật ngữ                 | Định nghĩa                                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **PRD**                   | Product Requirements Document, chứa vision, goals, FR, NFR và success criteria; tập trung vào cần xây cái gì.                    |
| **Architecture Document** | Tài liệu thiết kế hệ thống ở mức toàn cục, mô tả cấu trúc, component, data model, integration, security và deployment.           |
| **Product Brief**         | Tài liệu chiến lược tùy chọn ở giai đoạn đầu, ghi lại product vision, market context và yêu cầu cấp cao.                         |
| **Tech-Spec**             | Kế hoạch kỹ thuật toàn diện cho Quick Flow, bao gồm problem statement, solution approach, file-level change và testing strategy. |
| **Epic**                  | Nhóm feature cấp cao chứa nhiều story liên quan với nhau.                                                                        |

## Workflow và phase

| Thuật ngữ                   | Định nghĩa                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Phase 0: Documentation**  | Pha tiền điều kiện cho brownfield khi codebase thiếu tài liệu, thường dùng để document dự án hiện có. |
| **Phase 1: Analysis**       | Pha discovery gồm brainstorm, research và product brief.                                              |
| **Phase 2: Planning**       | Pha bắt buộc tạo formal requirements, dẫn tới tech-spec hoặc PRD.                                     |
| **Phase 3: Solutioning**    | Pha kiến trúc và readiness, nơi thường chạy architecture, system-level test-design, framework và ci.  |
| **Phase 4: Implementation** | Pha phát triển theo sprint và story, nơi diễn ra phần lớn workflow của DEV và TEA.                    |
| **Gate Check**              | Workflow validation để xác nhận tài liệu và readiness đã đủ trước khi chuyển sang bước tiếp theo.     |

## Agent và vai trò

| Thuật ngữ      | Định nghĩa                                                                               |
| -------------- | ---------------------------------------------------------------------------------------- |
| **Analyst**    | Agent khởi tạo workflow, làm research, tạo product brief và theo dõi tiến độ.            |
| **Architect**  | Agent thiết kế kiến trúc hệ thống và validate design.                                    |
| **PM**         | Product Manager agent tạo PRD hoặc tech-spec.                                            |
| **SM**         | Scrum Master agent quản lý sprint, tạo story và điều phối implementation.                |
| **DEV**        | Developer agent triển khai story, viết code, chạy test và review code.                   |
| **TEA**        | Test Architect agent chịu trách nhiệm chiến lược kiểm thử, quality gate và đánh giá NFR. |
| **Party Mode** | Chế độ nhiều agent thảo luận cùng nhau do BMad Master điều phối.                         |

## Trạng thái và theo dõi

| Thuật ngữ           | Định nghĩa                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------- |
| **DoD**             | Definition of Done - tiêu chí để một story được xem là hoàn thành.                          |
| **Workflow Status** | Điểm vào chung để kiểm tra file trạng thái hiện có, hiển thị tiến độ và gợi ý bước kế tiếp. |
| **Sprint**          | Khoảng thời gian phát triển cố định, thường 1-2 tuần.                                       |
| **Story**           | Đơn vị công việc có thể triển khai với acceptance criteria rõ ràng.                         |
| **Story File**      | File markdown mô tả story, acceptance criteria, technical note và testing requirement.      |

## Test Architect (TEA) Concepts

| Thuật ngữ                    | Định nghĩa                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **ATDD**                     | Acceptance Test-Driven Development - sinh failing acceptance test trước khi implementation, tương ứng red phase của TDD. |
| **Burn-in Testing**          | Chạy test nhiều lần liên tiếp để phát hiện flaky test và lỗi ngắt quãng.                                                 |
| **Coverage Traceability**    | Ánh xạ requirement, endpoint, oracle hoặc user journey với test đã có để biết mức bao phủ là FULL, PARTIAL hay NONE.     |
| **Epic-Level Test Design**   | Lập kế hoạch test cho từng epic ở Phase 4, tập trung vào risk, priority và coverage strategy của epic đó.                |
| **Fixture Architecture**     | Pattern xây pure function trước, rồi bọc bằng fixture theo framework để tăng testability và tái sử dụng.                 |
| **Gate Decision**            | Quyết định phát hành với 4 trạng thái: `PASS`, `CONCERNS`, `FAIL`, `WAIVED`.                                             |
| **Knowledge Fragment**       | Một file markdown đơn lẻ trong knowledge base của TEA, mô tả một pattern hoặc thực hành kiểm thử cụ thể.                 |
| **Browser Automation**       | Khả năng dùng Playwright CLI hoặc MCP để tương tác browser thật khi sinh hoặc chữa test.                                 |
| **Network-First Pattern**    | Pattern chờ phản hồi network thực tế thay vì timeout cố định, giúp giảm race condition và flakiness.                     |
| **NFR Assessment**           | Đánh giá yêu cầu phi chức năng như security, performance, reliability bằng evidence.                                     |
| **Playwright Utils**         | Gói tùy chọn `@seontechnologies/playwright-utils` cung cấp fixture và utility production-ready cho Playwright.           |
| **Risk-Based Testing**       | Cách ưu tiên kiểm thử theo business impact bằng điểm probability × impact.                                               |
| **System-Level Test Design** | Lập kế hoạch test ở mức architecture trong Phase 3, tập trung vào testability, ADR mapping và nhu cầu hạ tầng test.      |
| **tea-index.csv**            | File manifest theo dõi knowledge fragments, tags và workflow nào sẽ nạp chúng.                                           |
| **TEA Integrated**           | Mô hình dùng TEA đầy đủ xuyên các phase của BMad Method.                                                                 |
| **TEA Lite**                 | Cách dùng TEA đơn giản nhất, chủ yếu với `automate` để test feature hiện có.                                             |
| **TEA Solo**                 | Mô hình dùng TEA độc lập ngoài full BMad Method.                                                                         |
| **Test Priorities**          | Hệ thống phân loại độ quan trọng của test: P0, P1, P2, P3.                                                               |

## Thuật ngữ thực dụng khác

| Thuật ngữ               | Định nghĩa                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------- |
| **Brownfield**          | Dự án hoặc codebase đã tồn tại, có ràng buộc legacy và nguy cơ hồi quy.                |
| **Greenfield**          | Dự án mới, ít hoặc không có ràng buộc legacy.                                          |
| **Acceptance Criteria** | Điều kiện chấp nhận xác định hành vi nào cần được xem là đúng về mặt nghiệp vụ.        |
| **E2E**                 | End-to-end testing, kiểm thử luồng đầu-cuối qua nhiều lớp của hệ thống.                |
| **Fixture**             | Cơ chế setup/teardown hoặc cung cấp context dùng chung cho test.                       |
| **Flaky Test**          | Test cho kết quả không ổn định dù hệ thống không thay đổi thực sự.                     |
| **Coverage**            | Mức độ yêu cầu, rủi ro hoặc hành vi đã được bao phủ bởi test.                          |
| **Traceability**        | Khả năng nối requirement, test, evidence và gate decision thành chuỗi kiểm chứng được. |

## Xem thêm

- [TEA Overview](/docs/vi-vn/explanation/tea-overview.md)
- [TEA Knowledge Base](/docs/vi-vn/reference/knowledge-base.md)
- [TEA Command Reference](/docs/vi-vn/reference/commands.md)
- [TEA Configuration](/docs/vi-vn/reference/configuration.md)

---

Được tạo bằng [BMad Method](https://bmad-method.org)
