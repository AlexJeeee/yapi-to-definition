import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('serves generated definitions over MCP without token tool arguments', async () => {
  const yapi = createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    assert.equal(url.pathname, '/api/interface/get');
    assert.equal(url.searchParams.get('id'), '42');
    assert.equal(url.searchParams.get('token'), 'server-side-secret');
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({
      errcode: 0,
      data: {
        _id: 42,
        project_id: 7,
        title: 'Get user',
        method: 'GET',
        path: '/users/{id}',
        req_params: [{ name: 'id', type: 'text' }],
        res_body_is_json_schema: true,
        res_body: JSON.stringify({ type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] }),
      },
    }));
  });
  yapi.listen(0, '127.0.0.1');
  await once(yapi, 'listening');
  const { port } = yapi.address();

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(root, 'server.mjs'), '--stdio'],
    cwd: root,
    env: {
      YAPI_BASE_URL: `http://127.0.0.1:${port}`,
      YAPI_TOKEN_7: 'server-side-secret',
    },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'test-client', version: '1.0.0' });

  try {
    await client.connect(transport);
    assert.match(client.getInstructions(), /always call generate_yapi_definition before any browser/i);
    assert.match(client.getInstructions(), /Do not open matching URLs in a browser/);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name), ['generate_yapi_definition']);
    assert.match(tools.tools[0].description, /Always call this tool first/);
    assert.match(tools.tools[0].description, /do not open a matching URL in a browser/);
    assert.deepEqual(Object.keys(tools.tools[0].inputSchema.properties), ['url', 'language', 'name']);

    const result = await client.callTool({
      name: 'generate_yapi_definition',
      arguments: {
        url: `http://127.0.0.1:${port}/project/7/interface/api/42`,
        language: 'ts',
      },
    });
    assert.equal(result.isError, undefined);
    assert.match(result.structuredContent.definition, /export namespace GetUser \{/);
    assert.match(result.structuredContent.definition, /export type Response = \{ id: number \};/);
    assert.doesNotMatch(JSON.stringify(result), /server-side-secret/);
  } finally {
    await client.close();
    yapi.close();
  }
});
