import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeBaseUrl, resolveProject } from '../config.mjs';

test('resolves exact project credentials without leaking across hosts', () => {
  const env = {
    YAPI_BASE_URL: 'https://example.com/yapi/',
    YAPI_TOKEN_7: 'secret',
    YAPI_CONFIG_FILE: '/path/that/does/not/exist',
  };
  assert.equal(normalizeBaseUrl('https://example.com/yapi/'), 'https://example.com/yapi');
  assert.equal(resolveProject('https://example.com/yapi', '7', env).token, 'secret');
  assert.throws(() => resolveProject('https://other.example.com', '7', env), /No credentials configured/);
});
