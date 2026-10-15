# Playwright test annotations (reference snapshot for the contract fixture)

`test.skip()` marks a test as not to run. The test is not executed.

`test.fixme()` marks a test as failing and to be fixed. The test is not executed.

The two annotations record different intents: a skipped test is intentionally inert, a fixme test is a known defect.
