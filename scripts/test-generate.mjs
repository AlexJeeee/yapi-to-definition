import assert from 'node:assert/strict';
import { fetchDocument, generate, parseYapiUrl } from './generate.mjs';

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
assert.match(typescript, /export namespace GetUser \{/);
assert.match(typescript, /export type PathParams = \{ id: string \};/);
assert.match(typescript, /export type Query = \{ verbose\?: boolean \};/);
assert.match(typescript, /export type RequestBody = \{ name: string \};/);
assert.match(typescript, /export type Response = \{ data: Array<number> \};/);
assert.doesNotMatch(typescript, /export type GetUser/);
assert.match(typescript, /as const;/);

const javascript = generate(document, { lang: 'js' });
assert.match(javascript, /@typedef \{\{ data: Array<number> \}\} GetUserResponse/);
assert.doesNotMatch(javascript, /as const/);

const parsed = parseYapiUrl('https://example.com/yapi/project/7/interface/api/42');
assert.equal(parsed.endpoint.toString(), 'https://example.com/yapi/api/interface/get?id=42');
assert.equal(parsed.projectId, '7');

const direct = parseYapiUrl('https://example.com/yapi/api/interface/get?id=42&project_id=7');
assert.equal(direct.projectId, '7');

const originalFetch = globalThis.fetch;
globalThis.fetch = async (endpoint) => ({
  ok: true,
  json: async () => ({ data: { project_id: 7 } }),
  endpoint,
});
const fetched = await fetchDocument(parsed.endpoint, { projectId: '7', token: 'secret' });
assert.equal(fetched.project_id, 7);
assert.equal(parsed.endpoint.searchParams.get('token'), 'secret');
globalThis.fetch = originalFetch;

const inferredBody = generate({
  title: 'Create user',
  method: 'POST',
  path: '/users',
  req_body_type: 'json',
  req_body_is_json_schema: false,
  req_body_other: '{"name":"Ada"}',
}, { lang: 'ts' });
assert.match(inferredBody, /export namespace CreateUser \{/);
assert.match(inferredBody, /export type RequestBody = \{ name: string \}/);

console.log('ok');
