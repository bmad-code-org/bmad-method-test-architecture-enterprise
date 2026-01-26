# Agent Schema Validation Test Suite

Comprehensive test coverage for the BMAD agent schema validation system.

## Overview

This test suite validates the Zod-based schema validator (`tools/schema/agent.js`) that ensures all `*.agent.yaml` files conform to the BMAD agent specification.

## Quick Start

```bash
# Run all tests
npm test

# Run with coverage report
npm run test:coverage

# Run CLI integration tests
./test/test-cli-integration.sh

# Validate actual agent files
npm run validate:schemas
```
