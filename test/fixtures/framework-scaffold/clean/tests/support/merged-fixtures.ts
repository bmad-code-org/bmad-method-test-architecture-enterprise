import { mergeTests } from '@playwright/test';
import { log } from '@seontechnologies/playwright-utils';
import { test as apiRequestFixture } from '@seontechnologies/playwright-utils/api-request/fixtures';
import { test as recurseFixture } from '@seontechnologies/playwright-utils/recurse/fixtures';
// Browser suites only: this scaffold is frontend, so both are merged in.
import { test as interceptFixture } from '@seontechnologies/playwright-utils/intercept-network-call/fixtures';
import { test as networkErrorFixture } from '@seontechnologies/playwright-utils/network-error-monitor/fixtures';
// Project-owned:
import { test as authFixture } from './auth-fixture';

// This is the only entry point tests import `test` from.
export const test = mergeTests(apiRequestFixture, recurseFixture, interceptFixture, networkErrorFixture, authFixture);

export { expect } from '@playwright/test';
export { log };
