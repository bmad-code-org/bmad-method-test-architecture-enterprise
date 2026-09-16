import js from '@eslint/js';

export default [js.configs.recommended, { ignores: ['playwright-report/**', 'test-results/**'] }];
