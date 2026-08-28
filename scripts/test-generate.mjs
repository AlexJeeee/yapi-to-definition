import assert from 'node:assert/strict';
import { generate, parseYapiUrl } from './generate.mjs';

const document = {
  _id: 42,
  title: 'Get user',
  method: 'POST',
  path: '/users/{id}',
  req_params: [{ name: 'id', type: 'text' }],
  req_query: [{ name: 'verbose', type: 'boolean', required: '0' }],
  req_body_type: 'json',
  req_body_other: JSON.stringify({
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name'],
  }),
  res_body_is_json_schema: true,
  res_body: JSON.stringify({
    type: 'object',
    properties: { data: { type: 'array', items: { type: 'integer' } } },
    required: ['data'],
  }),
};

const typescript = generate(document, { lang: 'ts' });
assert.match(typescript, /export type GetUserPathParams = \{ id: string \};/);
assert.match(typescript, /export type GetUserQuery = \{ verbose\?: boolean \};/);
assert.match(typescript, /export type GetUserRequestBody = \{ name: string \};/);
assert.match(typescript, /export type GetUserResponse = \{ data: Array<number> \};/);
assert.match(typescript, /as const;/);

const javascript = generate(document, { lang: 'js' });
assert.match(javascript, /@typedef \{\{ data: Array<number> \}\} GetUserResponse/);
assert.doesNotMatch(javascript, /as const/);

const parsed = parseYapiUrl('https://example.com/yapi/project/7/interface/api/42');
assert.equal(parsed.endpoint.toString(), 'https://example.com/yapi/api/interface/get?id=42');
assert.equal(parsed.projectId, '7');

const direct = parseYapiUrl('https://example.com/yapi/api/interface/get?id=42&project_id=7');
assert.equal(direct.projectId, '7');

const inferredBody = generate({
  title: 'Create user',
  method: 'POST',
  path: '/users',
  req_body_type: 'json',
  req_body_is_json_schema: false,
  req_body_other: '{"name":"Ada"}',
}, { lang: 'ts' });
assert.match(inferredBody, /CreateUserRequestBody = \{ name: string \}/);

console.log('ok');
