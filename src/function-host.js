import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { basename, join } from "node:path";
import { discoverPage, fetchJson, fetchUrl, getConfig, getRobotsTxt, selectJsonPath } from "./fetcher-core.js";

const MAX_STEPS = 40;
const MAX_REGEX_MATCHES = 1000;
const MAX_FETCH_EACH_ITEMS = 100;
const MAX_FETCH_EACH_CONCURRENCY = 10;

export function listFetcherFunctions(config = getConfig()) {
  ensureFunctionsDir(config);
  return readdirSync(config.functionsDir)
    .filter((name) => name.endsWith(".json"))
    .map((file) => readFunctionFile(join(config.functionsDir, file)))
    .map((definition) => ({
      name: definition.name,
      description: definition.description || "",
      version: definition.version || "0.1.0",
      inputSchema: definition.inputSchema || {},
      stepCount: Array.isArray(definition.steps) ? definition.steps.length : 0
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getFetcherFunction(name, config = getConfig()) {
  ensureFunctionsDir(config);
  const filePath = functionPath(name, config);
  if (!existsSync(filePath)) {
    throw new Error(`Fetcher function not found: ${name}`);
  }
  return readFunctionFile(filePath);
}

export function saveFetcherFunction(input, config = getConfig()) {
  ensureFunctionsDir(config);
  const definition = normalizeDefinition(input.definition || input);
  const filePath = functionPath(definition.name, config);
  if (existsSync(filePath) && !input.overwrite) {
    throw new Error(`Fetcher function already exists: ${definition.name}. Pass overwrite=true to replace it.`);
  }
  const tempPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(definition, null, 2)}\n`, "utf8");
  renameSync(tempPath, filePath);
  return {
    saved: true,
    path: filePath,
    function: summarizeDefinition(definition)
  };
}

export function deleteFetcherFunction(name, config = getConfig()) {
  const filePath = functionPath(name, config);
  if (!existsSync(filePath)) {
    return { deleted: false, name: normalizeName(name) };
  }
  unlinkSync(filePath);
  return { deleted: true, name: normalizeName(name) };
}

export async function runFetcherFunction(input, config = getConfig()) {
  const definition = input.definition
    ? normalizeDefinition(input.definition)
    : getFetcherFunction(input.name, config);
  return runDefinition(definition, input.args || {}, {
    config,
    includeTrace: Boolean(input.trace)
  });
}

async function runDefinition(definition, args, options) {
  validateArgs(definition, args);
  const context = {
    args,
    steps: {}
  };
  const trace = [];

  for (const step of definition.steps) {
    const startedAt = Date.now();
    const value = await runStep(step, context, options.config);
    context.steps[step.id] = value;
    trace.push({
      id: step.id,
      op: step.op,
      elapsedMs: Date.now() - startedAt,
      preview: previewValue(value)
    });
  }

  const result = definition.returns
    ? resolveTemplateValue(definition.returns, context)
    : context.steps[definition.steps.at(-1)?.id];

  return {
    name: definition.name,
    result,
    trace: options.includeTrace ? trace : undefined
  };
}

async function runStep(step, context, config) {
  if (!step.id || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(step.id)) {
    throw new Error(`Invalid step id: ${step.id}`);
  }

  if (step.op === "fetch_url") {
    return fetchUrl(resolveTemplateValue(step.input || {}, context), config);
  }
  if (step.op === "fetch_json") {
    return fetchJson(resolveTemplateValue(step.input || {}, context), config);
  }
  if (step.op === "discover_page") {
    return discoverPage(resolveTemplateValue(step.input || {}, context), config);
  }
  if (step.op === "get_robots_txt") {
    return getRobotsTxt(resolveTemplateValue(step.input || {}, context), config);
  }
  if (step.op === "json_path") {
    return selectJsonPath(resolvePath(context, step.from), resolveTemplateString(step.path || "", context));
  }
  if (step.op === "regex") {
    return runRegex(step, context);
  }
  if (step.op === "map") {
    return runMap(step, context);
  }
  if (step.op === "unique") {
    return runUnique(step, context);
  }
  if (step.op === "fetch_each_json") {
    return runFetchEach(step, context, config, fetchJson);
  }
  if (step.op === "fetch_each_url") {
    return runFetchEach(step, context, config, fetchUrl);
  }
  if (step.op === "template") {
    return resolveTemplateValue(step.value, context);
  }
  throw new Error(`Unsupported function step op: ${step.op}`);
}

function runRegex(step, context) {
  const source = String(resolvePath(context, step.from) ?? "");
  const flags = String(step.flags || "g").includes("g") ? String(step.flags || "g") : `${step.flags || ""}g`;
  const pattern = new RegExp(resolveTemplateString(step.pattern || "", context), flags);
  const group = Number.isInteger(step.group) ? step.group : 1;
  const maxMatches = clampInteger(step.maxMatches, 1, MAX_REGEX_MATCHES, 100);
  const matches = [];
  for (const match of source.matchAll(pattern)) {
    matches.push(match[group] ?? match[0]);
    if (matches.length >= maxMatches) {
      break;
    }
  }
  return step.all === false ? matches[0] ?? "" : matches;
}

function runMap(step, context) {
  const values = resolvePath(context, step.from);
  if (!Array.isArray(values)) {
    throw new Error(`map step expected an array at ${step.from}`);
  }
  const maxItems = stepInteger(step.maxItems, context, 1, 10000, values.length);
  return values.slice(0, maxItems).map((item, index) => {
    const itemContext = {
      ...context,
      item,
      index,
      rank: index + 1
    };
    if (step.path) {
      return resolvePath(itemContext, step.path);
    }
    return resolveTemplateValue(step.value, itemContext);
  });
}

function runUnique(step, context) {
  const values = resolvePath(context, step.from);
  if (!Array.isArray(values)) {
    throw new Error(`unique step expected an array at ${step.from}`);
  }
  const maxItems = stepInteger(step.maxItems, context, 1, 10000, values.length);
  const seen = new Set();
  const output = [];
  for (const item of values) {
    const key = step.path ? resolvePath({ ...context, item }, step.path) : item;
    const normalizedKey = typeof key === "string" ? key : JSON.stringify(key);
    if (seen.has(normalizedKey)) {
      continue;
    }
    seen.add(normalizedKey);
    output.push(item);
    if (output.length >= maxItems) {
      break;
    }
  }
  return output;
}

async function runFetchEach(step, context, config, fetcher) {
  const values = resolvePath(context, step.from);
  if (!Array.isArray(values)) {
    throw new Error(`${step.op} step expected an array at ${step.from}`);
  }
  const maxItems = stepInteger(step.maxItems, context, 1, MAX_FETCH_EACH_ITEMS, Math.min(values.length, 10));
  const concurrency = stepInteger(step.concurrency, context, 1, MAX_FETCH_EACH_CONCURRENCY, 4);
  const inputTemplate = step.input || {};
  const selected = values.slice(0, maxItems);
  const results = new Array(selected.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < selected.length) {
      const index = nextIndex;
      nextIndex += 1;
      const itemContext = {
        ...context,
        item: selected[index],
        index,
        rank: index + 1
      };
      results[index] = await fetcher(resolveTemplateValue(inputTemplate, itemContext), config);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, selected.length) }, worker));
  return results;
}

function resolveTemplateValue(value, context) {
  if (typeof value === "string") {
    if (value.startsWith("$")) {
      return resolvePath(context, value.slice(1));
    }
    return resolveTemplateString(value, context);
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveTemplateValue(item, context));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveTemplateValue(item, context)]));
  }
  return value;
}

function resolveTemplateString(value, context) {
  return String(value || "").replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expression) => {
    const [path, ...modifiers] = String(expression).split("|").map((part) => part.trim());
    const selected = resolvePath(context, path) ?? resolvePath(context, `args.${path}`);
    if (selected === undefined || selected === null || selected === "") {
      const fallback = modifiers.find((modifier) => !isTemplateFilter(modifier));
      return fallback || "";
    }
    return modifiers.filter(isTemplateFilter).reduce((current, filter) => applyTemplateFilter(current, filter), String(selected));
  });
}

function isTemplateFilter(value) {
  return ["urlencode", "lower", "upper", "firstchar"].includes(String(value || "").toLowerCase());
}

function applyTemplateFilter(value, filter) {
  const normalized = String(filter || "").toLowerCase();
  if (normalized === "urlencode") {
    return encodeURIComponent(value);
  }
  if (normalized === "lower") {
    return value.toLowerCase();
  }
  if (normalized === "upper") {
    return value.toUpperCase();
  }
  if (normalized === "firstchar") {
    return value.trim().charAt(0);
  }
  return value;
}

function resolvePath(context, path) {
  const normalized = String(path || "")
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
  let current = context;
  for (const part of normalized) {
    if (current === undefined || current === null) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function validateArgs(definition, args) {
  const schema = definition.inputSchema || {};
  for (const [key, spec] of Object.entries(schema)) {
    if (spec?.required && (args[key] === undefined || args[key] === null || args[key] === "")) {
      throw new Error(`Missing required function argument: ${key}`);
    }
  }
}

function normalizeDefinition(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Function definition must be an object.");
  }
  const name = normalizeName(input.name);
  const steps = Array.isArray(input.steps) ? input.steps : [];
  if (!name) {
    throw new Error("Function definition requires a name.");
  }
  if (!steps.length || steps.length > MAX_STEPS) {
    throw new Error(`Function definition requires 1-${MAX_STEPS} steps.`);
  }
  const ids = new Set();
  for (const step of steps) {
    if (!step || typeof step !== "object" || Array.isArray(step)) {
      throw new Error("Each function step must be an object.");
    }
    if (!step.id || ids.has(step.id)) {
      throw new Error(`Duplicate or missing step id: ${step.id}`);
    }
    ids.add(step.id);
  }
  return {
    name,
    description: String(input.description || ""),
    version: String(input.version || "0.1.0"),
    inputSchema: input.inputSchema && typeof input.inputSchema === "object" && !Array.isArray(input.inputSchema)
      ? input.inputSchema
      : {},
    steps,
    returns: input.returns ?? `$steps.${steps.at(-1).id}`
  };
}

function summarizeDefinition(definition) {
  return {
    name: definition.name,
    description: definition.description,
    version: definition.version,
    inputSchema: definition.inputSchema,
    stepCount: definition.steps.length
  };
}

function readFunctionFile(filePath) {
  return normalizeDefinition(JSON.parse(readFileSync(filePath, "utf8")));
}

function ensureFunctionsDir(config) {
  mkdirSync(config.functionsDir, { recursive: true });
}

function functionPath(name, config) {
  const normalized = normalizeName(name);
  if (!normalized) {
    throw new Error("Function name is required.");
  }
  return join(config.functionsDir, `${normalized}.json`);
}

function normalizeName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function previewValue(value) {
  if (Array.isArray(value)) {
    return { type: "array", length: value.length, first: value[0] };
  }
  if (value && typeof value === "object") {
    return { type: "object", keys: Object.keys(value).slice(0, 12) };
  }
  return String(value ?? "").slice(0, 240);
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function stepInteger(value, context, min, max, fallback) {
  return clampInteger(resolveTemplateValue(value, context), min, max, fallback);
}
