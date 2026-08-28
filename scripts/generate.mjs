export function parseYapiUrl(source) {
  const url = new URL(source);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('YApi URL must use HTTP or HTTPS');
  const directId = url.pathname.endsWith('/api/interface/get') && url.searchParams.get('id');
  const documentMatch = url.pathname.match(/\/interface\/api\/(\d+)(?:\/|$)/);
  const projectId = url.pathname.match(/\/project\/(\d+)(?:\/|$)/)?.[1] || url.searchParams.get('project_id');
  const id = directId || documentMatch?.[1];
  if (!id) throw new Error('The URL does not contain a YApi interface id');

  const marker = directId ? '/api/interface/get' : '/project/';
  const markerIndex = url.pathname.indexOf(marker);
  const prefix = markerIndex < 0 ? '' : url.pathname.slice(0, markerIndex);
  const endpoint = new URL(`${prefix}/api/interface/get`, url.origin);
  endpoint.searchParams.set('id', String(id));
  return { baseUrl: `${url.origin}${prefix}`, endpoint, id: String(id), projectId };
}

function cleanSource(source) {
  if (!source) return '';
  const url = new URL(source);
  for (const key of [...url.searchParams.keys()]) {
    if (/token|key|auth|session/i.test(key)) url.searchParams.delete(key);
  }
  url.hash = '';
  return url.toString();
}

function unwrapResponse(payload) {
  if (payload?.errcode && payload.errcode !== 0) {
    throw new Error(payload.errmsg || `YApi returned error ${payload.errcode}`);
  }
  const document = payload?.data ?? payload;
  if (!document || typeof document !== 'object') throw new Error('YApi returned no interface data');
  return document;
}

export async function fetchDocument(source, options = {}) {
  const { endpoint, projectId: urlProjectId } = parseYapiUrl(source);
  const projectId = options.projectId || urlProjectId;
  const token = options.token;
  if (!projectId) throw new Error('A YApi project id is required');
  if (!token) throw new Error('A YApi project token is required');
  endpoint.searchParams.set('token', token);

  const headers = { accept: 'application/json' };

  return fetch(endpoint, { headers })
    .then(async (response) => {
      if (!response.ok) throw new Error(`YApi request failed: HTTP ${response.status}`);
      return response.json();
    })
    .then(unwrapResponse)
    .then((document) => {
      if (String(document.project_id) !== String(projectId)) {
        throw new Error(`Interface belongs to project ${document.project_id}, not ${projectId}`);
      }
      return document;
    })
    .catch((error) => {
      throw new Error(`Unable to read YApi interface: ${error.message}`);
    });
}

function parseJson(value) {
  if (!value || typeof value !== 'string') return value || null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function inferSchema(value) {
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) return { type: 'array', items: value.length ? inferSchema(value[0]) : {} };
  if (typeof value === 'object') {
    return {
      type: 'object',
      properties: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, inferSchema(item)])),
      required: Object.keys(value),
    };
  }
  return { type: typeof value };
}

function parameterSchema(type) {
  const normalized = String(type || 'string').toLowerCase();
  if (['number', 'integer'].includes(normalized)) return { type: normalized };
  if (['boolean', 'bool'].includes(normalized)) return { type: 'boolean' };
  if (['array', 'object'].includes(normalized)) return { type: normalized };
  if (normalized === 'file') return { type: 'string', format: 'binary' };
  return { type: 'string' };
}

function listSchema(items = [], requiredByDefault = false) {
  if (!items.length) return null;
  const required = items
    .filter((item) => requiredByDefault || item.required === true || String(item.required) === '1')
    .map((item) => item.name);
  return {
    type: 'object',
    properties: Object.fromEntries(items.map((item) => [item.name, parameterSchema(item.type)])),
    required,
  };
}

function requestBodySchema(document) {
  if (document.req_body_type === 'json') {
    const body = parseJson(document.req_body_other);
    if (!body) return {};
    const looksLikeSchema = body.$schema || body.type || body.properties || body.items || body.oneOf || body.anyOf || body.allOf;
    return document.req_body_is_json_schema || looksLikeSchema ? body : inferSchema(body);
  }
  if (document.req_body_type === 'form') return listSchema(document.req_body_form);
  if (document.req_body_type === 'raw') return { type: 'string' };
  return null;
}

function responseSchema(document) {
  const body = parseJson(document.res_body);
  if (!body) return {};
  const looksLikeSchema = body.$schema || body.type || body.properties || body.items || body.oneOf || body.anyOf || body.allOf;
  return document.res_body_is_json_schema || looksLikeSchema ? body : inferSchema(body);
}

function resolveRef(root, ref) {
  if (!ref?.startsWith('#/')) return null;
  return ref
    .slice(2)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce((value, part) => value?.[part], root);
}

function literal(value) {
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

function propertyName(name) {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
}

function schemaType(schema = {}, language = 'ts', root = schema, seen = new Set()) {
  if (schema.$ref) {
    const resolved = resolveRef(root, schema.$ref);
    if (!resolved || seen.has(resolved)) return 'unknown';
    return schemaType(resolved, language, root, new Set(seen).add(resolved));
  }
  if (schema.const !== undefined) return literal(schema.const);
  if (schema.enum?.length) return schema.enum.map(literal).join(' | ');

  const variants = schema.oneOf || schema.anyOf;
  if (variants?.length) return variants.map((item) => schemaType(item, language, root, seen)).join(' | ');
  if (schema.allOf?.length) return schema.allOf.map((item) => schemaType(item, language, root, seen)).join(' & ');
  if (Array.isArray(schema.type)) {
    return schema.type.map((type) => schemaType({ ...schema, type }, language, root, seen)).join(' | ');
  }

  if (schema.type === 'string') return schema.format === 'binary' ? 'File' : 'string';
  if (schema.type === 'number' || schema.type === 'integer') return 'number';
  if (schema.type === 'boolean') return 'boolean';
  if (schema.type === 'null') return 'null';
  if (schema.type === 'array' || schema.items) {
    const item = schemaType(schema.items || {}, language, root, seen);
    return `Array<${item}>`;
  }

  if (schema.type === 'object' || schema.properties || schema.additionalProperties) {
    const required = new Set(schema.required || []);
    const properties = Object.entries(schema.properties || {}).map(([name, value]) => {
      const optional = required.has(name) ? '' : '?';
      return `${propertyName(name)}${optional}: ${schemaType(value, language, root, seen)}`;
    });
    if (schema.additionalProperties) {
      const value = schema.additionalProperties === true ? 'unknown' : schemaType(schema.additionalProperties, language, root, seen);
      if (!properties.length) return language === 'js' ? `Object<string, ${value}>` : `Record<string, ${value}>`;
      properties.push(`[key: string]: ${value}`);
    }
    return properties.length ? `{ ${properties.join('; ')} }` : language === 'js' ? 'Object' : 'Record<string, unknown>';
  }

  return 'unknown';
}

function words(value) {
  return String(value || '').match(/[A-Za-z0-9]+/g) || [];
}

function pascalCase(value) {
  return words(value).map((part) => part[0].toUpperCase() + part.slice(1)).join('');
}

function camelCase(value) {
  const name = pascalCase(value) || 'api';
  return name[0].toLowerCase() + name.slice(1);
}

function defaultName(document) {
  const titleName = pascalCase(document.title);
  if (titleName) return titleName;
  return pascalCase(`${document.method || 'api'} ${document.path || document._id || ''}`) || `Api${document._id || ''}`;
}

function emitType(name, schema, language) {
  const type = schemaType(schema, language, schema);
  return language === 'ts'
    ? `export type ${name} = ${type};`
    : `/** @typedef {${type}} ${name} */`;
}

export function generate(document, { lang = 'ts', name, source = '' } = {}) {
  const typeName = pascalCase(name) || defaultName(document);
  const definitionName = `${camelCase(typeName)}Definition`;
  const sections = [
    ['PathParams', listSchema(document.req_params, true)],
    ['Query', listSchema(document.req_query)],
    ['Headers', listSchema(document.req_headers)],
    ['RequestBody', requestBodySchema(document)],
    ['Response', responseSchema(document)],
  ];
  const sourceLine = source ? `\n * Source: ${cleanSource(source)}` : '';
  const output = [
    `/**\n * ${document.title || typeName}\n * ${String(document.method || 'GET').toUpperCase()} ${document.path || '/'}${sourceLine}\n */`,
    ...sections.filter(([, schema]) => schema).map(([suffix, schema]) => emitType(`${typeName}${suffix}`, schema, lang)),
    `export const ${definitionName} = {\n  method: ${JSON.stringify(String(document.method || 'GET').toUpperCase())},\n  path: ${JSON.stringify(document.path || '/')},\n}${lang === 'ts' ? ' as const' : ''};`,
    '',
  ];
  return output.join('\n\n');
}
