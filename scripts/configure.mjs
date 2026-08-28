#!/usr/bin/env node

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { defaultConfigPath, normalizeBaseUrl } from '../config.mjs';

const usage = 'Usage: yapi-to-definition-config add <base-url> <project-id> [--token-env NAME] [--config FILE]';

function parseArgs(argv) {
  const [command, baseUrl, projectId, ...rest] = argv;
  const options = { command, baseUrl, projectId };
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === '--token-env') options.tokenEnv = rest[++index];
    else if (rest[index] === '--config') options.config = rest[++index];
    else throw new Error(`Unknown argument: ${rest[index]}`);
  }
  if (command !== 'add' || !baseUrl || !/^\d+$/.test(projectId || '')) throw new Error(usage);
  return options;
}

function readSecret(prompt) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) throw new Error('Set YAPI_TOKEN when running non-interactively');
  return new Promise((resolve, reject) => {
    let value = '';
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.setEncoding('utf8');
    process.stdin.resume();
    const finish = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
      process.stdout.write('\n');
    };
    const onData = (input) => {
      for (const character of input) {
        if (character === '\r' || character === '\n') {
          finish();
          return value ? resolve(value) : reject(new Error('Token cannot be empty'));
        }
        if (character === '\u0003') {
          finish();
          return reject(new Error('Cancelled'));
        }
        if (character === '\u007f') value = value.slice(0, -1);
        else value += character;
      }
    };
    process.stdin.on('data', onData);
  });
}

const options = parseArgs(process.argv.slice(2));
const path = options.config || defaultConfigPath();
const config = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { projects: [] };
if (!Array.isArray(config.projects)) throw new Error(`${path} must contain a projects array`);

const project = {
  baseUrl: normalizeBaseUrl(options.baseUrl),
  projectId: options.projectId,
};
if (options.tokenEnv) project.tokenEnv = options.tokenEnv;
else project.token = process.env.YAPI_TOKEN || await readSecret('YApi project token: ');

const index = config.projects.findIndex(
  (item) => normalizeBaseUrl(item.baseUrl) === project.baseUrl && String(item.projectId) === project.projectId,
);
if (index < 0) config.projects.push(project);
else config.projects[index] = project;

mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
chmodSync(path, 0o600);
console.log(`Configured ${project.baseUrl} project ${project.projectId} in ${path}`);
