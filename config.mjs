import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function defaultConfigPath(env = process.env, platform = process.platform) {
  if (env.YAPI_CONFIG_FILE) return env.YAPI_CONFIG_FILE;
  if (platform === 'win32') return join(env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'yapi-to-definition', 'config.json');
  return join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'yapi-to-definition', 'config.json');
}

export function normalizeBaseUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('baseUrl must use HTTP or HTTPS');
  if (url.username || url.password || url.search || url.hash) throw new Error('baseUrl cannot contain credentials, query, or hash');
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}

function normalizeProject(project, env) {
  if (!project || !project.baseUrl || !project.projectId) throw new Error('Each project needs baseUrl and projectId');
  const token = project.token || (project.tokenEnv && env[project.tokenEnv]);
  if (!token) throw new Error(`No token configured for ${project.baseUrl} project ${project.projectId}`);
  return {
    baseUrl: normalizeBaseUrl(project.baseUrl),
    projectId: String(project.projectId),
    token,
  };
}

export function loadProjects(env = process.env) {
  const projects = [];
  const singleProject = env.YAPI_PROJECT_ID || env.YAPI_TOKEN;
  if (singleProject) {
    if (!env.YAPI_BASE_URL || !env.YAPI_PROJECT_ID || !env.YAPI_TOKEN) {
      throw new Error('YAPI_BASE_URL, YAPI_PROJECT_ID, and YAPI_TOKEN must be set together');
    }
    projects.push({ baseUrl: env.YAPI_BASE_URL, projectId: env.YAPI_PROJECT_ID, token: env.YAPI_TOKEN });
  }

  const path = defaultConfigPath(env);
  if (existsSync(path)) {
    const config = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(config.projects)) throw new Error(`${path} must contain a projects array`);
    projects.push(...config.projects);
  }
  return projects.map((project) => normalizeProject(project, env));
}

export function resolveProject(baseUrl, projectId, env = process.env) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const normalizedProjectId = String(projectId);
  const token = env[`YAPI_TOKEN_${normalizedProjectId}`];
  if (env.YAPI_BASE_URL && normalizeBaseUrl(env.YAPI_BASE_URL) === normalizedBaseUrl && token) {
    return { baseUrl: normalizedBaseUrl, projectId: normalizedProjectId, token };
  }
  const project = loadProjects(env).find(
    (item) => item.baseUrl === normalizedBaseUrl && item.projectId === normalizedProjectId,
  );
  if (!project) {
    throw new Error(
      `No credentials configured for ${normalizedBaseUrl} project ${projectId}. Set YAPI_BASE_URL and YAPI_TOKEN_${normalizedProjectId}, or configure ${defaultConfigPath(env)}.`,
    );
  }
  return project;
}
