# CLI adapter

The registry invokes the adopter-owned `bin/review.mjs` executable from a disposable copy of `target/`. The command receives JSON stdin when `action` and `file` are bound, including the type-violating numeric `file` case. A single `raw` string binding sends its bytes unchanged for empty, invalid JSON, and malformed request examples. No adapter code or environment keys are required.
