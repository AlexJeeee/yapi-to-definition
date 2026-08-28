#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { resolveProject } from './config.mjs';
import { fetchDocument, generate, parseYapiUrl } from './scripts/generate.mjs';

const args = process.argv.slice(2);
if (args.length && !(args.length === 1 && args[0] === '--stdio')) {
  console.error('Usage: yapi-to-definition --stdio');
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const server = new McpServer(
  { name: 'yapi-to-definition', version },
  {
    instructions:
      'Use generate_yapi_definition when the user provides a YApi interface link and wants TypeScript or JavaScript definitions. The server owns YApi credentials; never ask the user to put a token in the tool arguments. Fit the returned code into the target repository conventions.',
  },
);

server.registerTool(
  'generate_yapi_definition',
  {
    title: 'Generate YApi definition',
    description: 'Generate TypeScript types or JavaScript JSDoc definitions from a configured private YApi interface URL.',
    inputSchema: {
      url: z.string().url().describe('YApi interface documentation URL; do not include credentials or tokens.'),
      language: z.enum(['ts', 'js']).optional().describe('Output language. Defaults to TypeScript.'),
      name: z.string().min(1).optional().describe('Optional PascalCase symbol name override.'),
    },
    outputSchema: {
      projectId: z.string(),
      language: z.enum(['ts', 'js']),
      definition: z.string(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  },
  ({ url, language = 'ts', name }) => {
    return Promise.resolve()
      .then(() => {
        const source = new URL(url);
        if ([...source.searchParams.keys()].some((key) => /token|key|auth|session/i.test(key))) {
          throw new Error('Remove credentials from the URL and configure them on the MCP server.');
        }
        const parsed = parseYapiUrl(url);
        if (!parsed.projectId) throw new Error('The YApi URL must contain /project/<id>/ or project_id.');
        const project = resolveProject(parsed.baseUrl, parsed.projectId);
        return fetchDocument(url, project).then((document) => ({ document, parsed }));
      })
      .then(({ document, parsed }) => {
        const definition = generate(document, { lang: language, name, source: url });
        const structuredContent = { projectId: parsed.projectId, language, definition };
        return { content: [{ type: 'text', text: definition }], structuredContent };
      })
      .catch((error) => ({
        isError: true,
        content: [{ type: 'text', text: error.message }],
      }));
  },
);

await server.connect(new StdioServerTransport());
