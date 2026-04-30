import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Buffer } from "node:buffer";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_BYTES = 1024 * 1024;
const MAX_HARD_BYTES = 20 * 1024 * 1024;
const DEFAULT_USER_AGENT = "waFetchMCP/0.1";
const TEXT_CONTENT_TYPES = [
  "application/json",
  "application/javascript",
  "application/xml",
  "application/xhtml+xml",
  "application/x-www-form-urlencoded",
  "text/"
];

export function getConfig(env = process.env) {
  return {
    allowPrivate: parseBoolean(env.FETCHER_ALLOW_PRIVATE, false),
    defaultTimeoutMs: clampInteger(env.FETCHER_TIMEOUT_MS, 1000, 120000, DEFAULT_TIMEOUT_MS),
    defaultMaxBytes: clampInteger(env.FETCHER_MAX_BYTES, 1024, MAX_HARD_BYTES, DEFAULT_MAX_BYTES),
    defaultUserAgent: String(env.FETCHER_USER_AGENT || DEFAULT_USER_AGENT),
    functionsDir: resolve(env.FETCHER_FUNCTIONS_DIR || join(PROJECT_ROOT, "functions"))
  };
}

export function getStatus(config = getConfig()) {
  return {
    allowPrivate: config.allowPrivate,
    defaultTimeoutMs: config.defaultTimeoutMs,
    defaultMaxBytes: config.defaultMaxBytes,
    functionsDir: config.functionsDir,
    hardMaxBytes: MAX_HARD_BYTES,
    allowedProtocols: ["http:", "https:"]
  };
}

export async function fetchUrl(input, config = getConfig()) {
  const options = normalizeFetchInput(input, config);
  await assertUrlAllowed(options.url, config);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetchWithRedirects(options, config, controller.signal);
    return normalizeResponse(response, options);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithRedirects(options, config, signal) {
  const headers = buildHeaders(options.headers, config);
  let url = options.url;
  let method = options.method;
  let body = options.body;

  for (let redirectCount = 0; redirectCount <= 20; redirectCount += 1) {
    const response = await fetch(url.toString(), {
      method,
      headers,
      body,
      redirect: "manual",
      signal
    });

    if (!options.followRedirects || !isRedirectResponse(response.status)) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) {
      return response;
    }

    const nextUrl = new URL(location, response.url || url);
    await assertUrlAllowed(nextUrl, config);
    await response.body?.cancel();

    if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === "POST")) {
      method = "GET";
      body = undefined;
    }
    url = nextUrl;
  }

  throw new Error("Too many redirects.");
}

function isRedirectResponse(status) {
  return [301, 302, 303, 307, 308].includes(status);
}

export async function fetchJson(input, config = getConfig()) {
  const fetched = await fetchUrl({
    ...input,
    responseType: "json"
  }, config);
  if (fetched.json === undefined) {
    throw new Error("Response was not valid JSON.");
  }
  const path = String(input?.path || "").trim();
  return {
    ...fetched,
    selected: path ? selectJsonPath(fetched.json, path) : undefined
  };
}

export async function getRobotsTxt(input, config = getConfig()) {
  const robotsUrl = buildRobotsUrl(input);
  const fetched = await fetchUrl({
    url: robotsUrl,
    method: "GET",
    responseType: "text",
    followRedirects: input?.followRedirects ?? true,
    timeoutMs: input?.timeoutMs,
    maxBytes: input?.maxBytes
  }, config);
  const parsed = parseRobotsTxt(fetched.text || "");
  return {
    url: fetched.url,
    finalUrl: fetched.finalUrl,
    status: fetched.status,
    statusText: fetched.statusText,
    ok: fetched.ok,
    headers: fetched.headers,
    truncated: fetched.truncated,
    bytesRead: fetched.bytesRead,
    challenge: fetched.challenge,
    ...parsed
  };
}

export async function discoverPage(input, config = getConfig()) {
  const fetched = await fetchUrl({
    ...input,
    method: "GET",
    responseType: "text"
  }, config);
  const html = fetched.text || "";
  const baseUrl = new URL(fetched.finalUrl || input.url);
  return {
    url: fetched.url,
    finalUrl: fetched.finalUrl,
    status: fetched.status,
    headers: fetched.headers,
    truncated: fetched.truncated,
    challenge: fetched.challenge,
    title: firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
    meta: extractMeta(html).slice(0, 80),
    jsonLd: extractJsonLd(html).slice(0, 40),
    openGraph: extractOpenGraph(html, baseUrl),
    links: extractLinks(html, baseUrl).slice(0, clampInteger(input?.maxItems, 1, 500, 100)),
    scripts: extractScripts(html, baseUrl).slice(0, clampInteger(input?.maxItems, 1, 500, 100)),
    forms: extractForms(html, baseUrl).slice(0, 60),
    endpoints: extractEndpointStrings(html, baseUrl).slice(0, 200)
  };
}

async function normalizeResponse(response, options) {
  const headers = Object.fromEntries(response.headers.entries());
  const contentType = response.headers.get("content-type") || "";
  const reader = response.body?.getReader();
  if (!reader) {
    const output = {
      url: options.url.toString(),
      finalUrl: response.url,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers,
      truncated: false,
      bytesRead: 0
    };
    output.challenge = detectChallengeBlock({
      status: output.status,
      statusText: output.statusText,
      headers,
      contentType,
      url: output.url,
      finalUrl: output.finalUrl,
      text: ""
    });
    return {
      ...output
    };
  }

  const chunks = [];
  let bytesRead = 0;
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (bytesRead + value.byteLength > options.maxBytes) {
      chunks.push(value.slice(0, Math.max(0, options.maxBytes - bytesRead)));
      bytesRead = options.maxBytes;
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
    bytesRead += value.byteLength;
  }

  const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), bytesRead);
  const responseType = chooseResponseType(options.responseType, contentType);
  const output = {
    url: options.url.toString(),
    finalUrl: response.url,
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    headers,
    contentType,
    truncated,
    bytesRead
  };

  if (responseType === "base64") {
    output.base64 = buffer.toString("base64");
    output.challenge = detectChallengeBlock({
      status: output.status,
      statusText: output.statusText,
      headers,
      contentType,
      url: output.url,
      finalUrl: output.finalUrl,
      text: ""
    });
  } else {
    const text = decodeText(buffer, contentType);
    output.challenge = detectChallengeBlock({
      status: output.status,
      statusText: output.statusText,
      headers,
      contentType,
      url: output.url,
      finalUrl: output.finalUrl,
      text
    });
    if (responseType === "json") {
      try {
        output.json = JSON.parse(text);
      } catch {
        output.text = text;
      }
    } else {
      output.text = text;
    }
  }
  return output;
}

function buildRobotsUrl(input = {}) {
  if (!input.host && !input.url) {
    throw new Error("host or url is required");
  }

  let host;
  let protocol = "https:";
  if (input.url) {
    const source = new URL(String(input.url));
    host = source.host;
    protocol = input.protocol || (input.useSourceProtocol ? source.protocol : "https:");
  } else {
    const rawHost = String(input.host).trim();
    if (/^https?:\/\//i.test(rawHost)) {
      const source = new URL(rawHost);
      host = source.host;
      protocol = input.protocol || source.protocol;
    } else {
      host = rawHost.replace(/^\/+|\/+$/g, "");
      protocol = input.protocol || "https:";
    }
  }

  const normalizedProtocol = String(protocol).endsWith(":") ? String(protocol) : `${protocol}:`;
  if (!["http:", "https:"].includes(normalizedProtocol)) {
    throw new Error(`Unsupported robots.txt protocol: ${protocol}`);
  }
  if (!host || host.includes("/") || host.includes("?") || host.includes("#")) {
    throw new Error(`Invalid robots.txt host: ${host}`);
  }
  return new URL("/robots.txt", `${normalizedProtocol}//${host}`).href;
}

function parseRobotsTxt(text) {
  const sections = [];
  const sitemaps = [];
  let current;

  for (const [index, rawLine] of String(text || "").split(/\r?\n/).entries()) {
    const line = stripRobotsComment(rawLine).trim();
    if (!line) {
      continue;
    }
    const separator = line.indexOf(":");
    if (separator < 0) {
      continue;
    }

    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "sitemap") {
      sitemaps.push(value);
      continue;
    }
    if (field === "user-agent") {
      if (!current || current.rules.length > 0 || current.crawlDelay !== undefined) {
        current = {
          userAgents: [],
          allow: [],
          disallow: [],
          rules: []
        };
        sections.push(current);
      }
      current.userAgents.push(value);
      continue;
    }
    if (!current) {
      current = {
        userAgents: [],
        allow: [],
        disallow: [],
        rules: []
      };
      sections.push(current);
    }
    if (field === "allow" || field === "disallow") {
      current[field].push(value);
      current.rules.push({
        directive: field,
        path: value,
        line: index + 1
      });
    } else if (field === "crawl-delay") {
      current.crawlDelay = value;
    }
  }

  return {
    sections: sections.map((section) => ({
      ...section,
      userAgents: Array.from(new Set(section.userAgents)),
      allow: Array.from(new Set(section.allow)),
      disallow: Array.from(new Set(section.disallow))
    })),
    sitemaps: Array.from(new Set(sitemaps))
  };
}

function stripRobotsComment(line) {
  const value = String(line || "");
  const index = value.indexOf("#");
  return index >= 0 ? value.slice(0, index) : value;
}

function normalizeFetchInput(input = {}, config) {
  if (!input.url) {
    throw new Error("url is required");
  }
  const url = new URL(String(input.url));
  const method = String(input.method || "GET").toUpperCase();
  if (!/^[A-Z]+$/.test(method)) {
    throw new Error(`Invalid HTTP method: ${input.method}`);
  }

  let body = input.body;
  if (input.json !== undefined) {
    body = JSON.stringify(input.json);
  }
  if ((method === "GET" || method === "HEAD") && body !== undefined && body !== "") {
    throw new Error(`${method} requests cannot include a body.`);
  }

  return {
    url,
    method,
    headers: normalizeHeaders(input.headers || {}),
    body,
    responseType: normalizeResponseType(input.responseType || "auto"),
    followRedirects: Boolean(input.followRedirects ?? true),
    timeoutMs: clampInteger(input.timeoutMs, 1000, 120000, config.defaultTimeoutMs),
    maxBytes: clampInteger(input.maxBytes, 1024, MAX_HARD_BYTES, config.defaultMaxBytes)
  };
}

function buildHeaders(headers, config) {
  const output = {
    "user-agent": config.defaultUserAgent,
    accept: "*/*",
    ...headers
  };
  if (headers.authorization && !parseBoolean(process.env.FETCHER_ALLOW_AUTH_HEADER, false)) {
    throw new Error("Authorization header is blocked unless FETCHER_ALLOW_AUTH_HEADER=true.");
  }
  return output;
}

function normalizeHeaders(headers) {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    throw new Error("headers must be an object.");
  }
  const output = {};
  for (const [key, value] of Object.entries(headers)) {
    const name = String(key).trim().toLowerCase();
    if (!/^[!#$%&'*+\-.^_`|~0-9a-z]+$/.test(name)) {
      throw new Error(`Invalid header name: ${key}`);
    }
    output[name] = String(value);
  }
  return output;
}

async function assertUrlAllowed(url, config) {
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`Unsupported URL protocol: ${url.protocol}`);
  }
  if (config.allowPrivate) {
    return;
  }
  const hostname = url.hostname;
  if (isPrivateHostname(hostname)) {
    throw new Error(`Private or local hostname blocked: ${hostname}`);
  }
  const records = await lookup(hostname, { all: true, verbatim: true });
  for (const record of records) {
    if (isPrivateIp(record.address)) {
      throw new Error(`Private or local resolved address blocked for ${hostname}: ${record.address}`);
    }
  }
}

function isPrivateHostname(hostname) {
  const value = String(hostname || "").toLowerCase();
  return value === "localhost" || value.endsWith(".localhost") || value === "0.0.0.0";
}

function isPrivateIp(address) {
  const family = isIP(address);
  if (family === 4) {
    const parts = address.split(".").map((part) => Number(part));
    const [a, b] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a >= 224)
    );
  }
  if (family === 6) {
    const value = address.toLowerCase();
    return value === "::1" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80:");
  }
  return false;
}

function chooseResponseType(responseType, contentType) {
  if (responseType !== "auto") {
    return responseType;
  }
  if (contentType.toLowerCase().includes("application/json")) {
    return "json";
  }
  return TEXT_CONTENT_TYPES.some((type) => contentType.toLowerCase().includes(type)) ? "text" : "base64";
}

function normalizeResponseType(value) {
  const type = String(value || "auto").toLowerCase();
  if (["auto", "text", "json", "base64"].includes(type)) {
    return type;
  }
  throw new Error(`Unsupported responseType: ${value}`);
}

function decodeText(buffer, contentType) {
  const charset = /charset=([^;]+)/i.exec(contentType)?.[1]?.trim().toLowerCase() || "utf-8";
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

export function selectJsonPath(value, path) {
  const parts = path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
  let current = value;
  for (const part of parts) {
    if (current === undefined || current === null) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function detectChallengeBlock({ status, statusText, headers, contentType, url, finalUrl, text }) {
  const signals = [];
  const headerText = Object.entries(headers || {})
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  const body = String(text || "").slice(0, 250000);
  const haystack = `${status || ""} ${statusText || ""}\n${contentType || ""}\n${headerText}\n${body}`.toLowerCase();
  const finalUrlValue = String(finalUrl || url || "");

  const add = (category, reason, evidence) => {
    signals.push({ category, reason, evidence });
  };

  if (status === 429) {
    add("rate_limit", "HTTP 429 Too Many Requests", "status");
  }
  if (headers?.["retry-after"] || headers?.["x-ratelimit-remaining"] === "0") {
    add("rate_limit", "Rate-limit headers present", "headers");
  }
  if (status === 401 || status === 407 || headers?.["www-authenticate"]) {
    add("login_wall", "Authentication is required", "status_or_headers");
  }
  if (status === 403) {
    add("access_denied", "HTTP 403 Forbidden", "status");
  }
  if (status === 503 && /\bcloudflare\b|cf-ray:|cf-chl|challenge/.test(haystack)) {
    add("cloudflare", "Cloudflare or challenge page returned HTTP 503", "status_and_headers");
  }
  if (headers?.["x-amzn-waf-action"] && String(headers["x-amzn-waf-action"]).toLowerCase() !== "allow") {
    add("bot_challenge", `AWS WAF action reported: ${headers["x-amzn-waf-action"]}`, "headers");
  }
  if (isLoginWallUrl(finalUrlValue) || isLoginWallUrl(headers?.location)) {
    add("login_wall", "Final or redirect URL appears to require login", "url");
  }

  const patterns = [
    ["captcha", /g-recaptcha|recaptcha\/api\.js|hcaptcha|cf-turnstile|data-sitekey|captcha/i, "CAPTCHA markup or provider token found"],
    ["captcha", /verify (?:that )?you(?:'re| are) (?:a )?human|human verification|prove you are human/i, "Human verification language found"],
    ["cloudflare", /attention required!\s*\|\s*cloudflare|checking if the site connection is secure|just a moment\.\.\.|cf-browser-verification|cf-chl-|challenge-platform/i, "Cloudflare challenge text found"],
    ["bot_challenge", /bot detection|automated (?:access|queries|traffic)|unusual traffic|please enable cookies|enable javascript and cookies|access denied reference/i, "Bot challenge or anti-automation language found"],
    ["bot_challenge", /x-amzn-waf-action:\s*(?!allow\b)\w+|aws waf|amazon waf/i, "AWS WAF challenge or block marker found"],
    ["bot_challenge", /akamai bot manager|perimeterx|datadome|_px3|incapsula|distil_r_captcha/i, "Known bot protection vendor marker found"],
    ["login_wall", /<input[^>]+type=["']?password|sign in to continue|log in to continue|login required|create an account or sign in/i, "Login form or login-wall language found"],
    ["rate_limit", /too many requests|rate limit(?:ed| exceeded)?|temporarily blocked|slow down/i, "Rate-limit language found"]
  ];

  for (const [category, pattern, reason] of patterns) {
    if (pattern.test(body) || (category === "cloudflare" && pattern.test(headerText))) {
      add(category, reason, "body_or_headers");
    }
  }

  if (/\bcloudflare\b/i.test(String(headers?.server || "")) && (status >= 400 || signals.some((signal) => signal.category === "cloudflare"))) {
    add("cloudflare", "Cloudflare server header present on blocked or challenged response", "headers");
  }
  if (headers?.["cf-ray"] && (status >= 400 || signals.some((signal) => signal.category === "cloudflare"))) {
    add("cloudflare", "Cloudflare cf-ray header present on blocked or challenged response", "headers");
  }

  if (signals.length === 0) {
    return {
      detected: false,
      categories: [],
      signals: []
    };
  }

  const categories = Array.from(new Set(signals.map((signal) => signal.category)));
  return {
    detected: true,
    categories,
    primaryCategory: categories[0],
    signals: dedupeSignals(signals),
    publicWebSafeAction: "Diagnostic only. waFetchMCP does not solve CAPTCHA, evade bot checks, or bypass access controls; downstream workflows decide how to handle this response."
  };
}

function isLoginWallUrl(value) {
  if (!value) {
    return false;
  }
  try {
    const url = new URL(String(value), "https://example.invalid");
    return /\/(?:login|log-in|signin|sign-in|auth|account|session)(?:\/|$)/i.test(url.pathname);
  } catch {
    return /\b(?:login|signin|auth|account|session)\b/i.test(String(value));
  }
}

function dedupeSignals(signals) {
  const seen = new Set();
  return signals.filter((signal) => {
    const key = `${signal.category}:${signal.reason}:${signal.evidence}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function extractMeta(html) {
  const values = [];
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = parseAttrs(tag[0]);
    values.push({
      name: attrs.name || attrs.property || attrs["http-equiv"] || "",
      content: attrs.content || ""
    });
  }
  return values.filter((item) => item.name || item.content);
}

function extractJsonLd(html) {
  const values = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = parseAttrs(match[1]);
    if (!String(attrs.type || "").toLowerCase().includes("application/ld+json")) {
      continue;
    }
    const raw = decodeHtml(match[2]).trim();
    if (!raw) {
      continue;
    }
    try {
      values.push(JSON.parse(raw));
    } catch (error) {
      values.push({
        parseError: error.message,
        rawPreview: raw.slice(0, 500)
      });
    }
  }
  return values;
}

function extractOpenGraph(html, baseUrl) {
  const properties = [];
  const openGraph = {
    properties,
    images: [],
    videos: [],
    audios: []
  };
  const mediaMap = {
    "og:image": "images",
    "og:video": "videos",
    "og:audio": "audios"
  };
  const simpleMap = {
    "og:title": "title",
    "og:type": "type",
    "og:url": "url",
    "og:description": "description",
    "og:site_name": "siteName",
    "og:locale": "locale"
  };
  const currentMediaByType = {
    images: null,
    videos: null,
    audios: null
  };

  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = parseAttrs(tag[0]);
    const property = String(attrs.property || attrs.name || "").toLowerCase();
    const content = attrs.content || "";
    if (!property.startsWith("og:") || !content) {
      continue;
    }
    const normalizedContent = shouldResolveOpenGraphUrl(property) ? resolveUrl(content, baseUrl) : content;
    properties.push({ property, content: normalizedContent });

    if (simpleMap[property]) {
      openGraph[simpleMap[property]] = normalizedContent;
      continue;
    }
    if (mediaMap[property]) {
      const collection = mediaMap[property];
      const currentMedia = {
        url: normalizedContent
      };
      currentMediaByType[collection] = currentMedia;
      openGraph[collection].push(currentMedia);
      continue;
    }

    const mediaProperty = Object.keys(mediaMap).find((prefix) => property.startsWith(`${prefix}:`));
    if (mediaProperty) {
      const collection = mediaMap[mediaProperty];
      const key = property.slice(mediaProperty.length + 1).replace(/:([a-z])/g, (_, char) => char.toUpperCase());
      let currentMedia = currentMediaByType[collection];
      if (!currentMedia) {
        currentMedia = {};
        currentMediaByType[collection] = currentMedia;
        openGraph[collection].push(currentMedia);
      }
      currentMedia[key] = shouldResolveOpenGraphUrl(property) ? resolveUrl(content, baseUrl) : content;
    }
  }

  return openGraph;
}

function shouldResolveOpenGraphUrl(property) {
  return /^og:(?:url|image|video|audio)(?::(?:url|secure_url))?$/i.test(property);
}

function extractLinks(html, baseUrl) {
  const values = [];
  for (const tag of html.matchAll(/<a\b[^>]*>/gi)) {
    const attrs = parseAttrs(tag[0]);
    if (!attrs.href) {
      continue;
    }
    values.push({
      href: resolveUrl(attrs.href, baseUrl),
      text: nearbyText(html, tag.index),
      rel: attrs.rel || ""
    });
  }
  return dedupeObjects(values, "href");
}

function extractScripts(html, baseUrl) {
  const values = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = parseAttrs(match[1]);
    values.push({
      src: attrs.src ? resolveUrl(attrs.src, baseUrl) : "",
      type: attrs.type || "",
      inlinePreview: attrs.src ? "" : cleanText(match[2]).slice(0, 500)
    });
  }
  return values;
}

function extractForms(html, baseUrl) {
  const values = [];
  for (const match of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const attrs = parseAttrs(match[1]);
    const inputs = [];
    for (const input of match[2].matchAll(/<(?:input|select|textarea|button)\b[^>]*>/gi)) {
      const inputAttrs = parseAttrs(input[0]);
      inputs.push({
        name: inputAttrs.name || "",
        type: inputAttrs.type || input[0].match(/^<([a-z]+)/i)?.[1]?.toLowerCase() || ""
      });
    }
    values.push({
      method: String(attrs.method || "GET").toUpperCase(),
      action: resolveUrl(attrs.action || baseUrl.href, baseUrl),
      inputs
    });
  }
  return values;
}

function extractEndpointStrings(html, baseUrl) {
  const values = [];
  const patterns = [
    /["'`](\/(?:api|rest|graphql|v\d+|ajax|search|product|products|wm|ftps)[^"'`<>\s]*)["'`]/gi,
    /["'`](https?:\/\/[^"'`<>\s]+)["'`]/gi
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      values.push(resolveUrl(match[1], baseUrl));
    }
  }
  return Array.from(new Set(values));
}

function parseAttrs(tag) {
  const attrs = {};
  for (const match of String(tag).matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) {
    attrs[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

function resolveUrl(value, baseUrl) {
  try {
    return new URL(decodeHtml(value), baseUrl).href;
  } catch {
    return decodeHtml(value);
  }
}

function nearbyText(html, index) {
  const end = html.indexOf("</a>", index);
  if (end < 0) {
    return "";
  }
  return cleanText(html.slice(index, end)).slice(0, 180);
}

function firstMatch(value, pattern) {
  return cleanText(pattern.exec(value)?.[1] || "");
}

function cleanText(value) {
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function decodeHtml(value) {
  return String(value || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function dedupeObjects(values, key) {
  const seen = new Set();
  return values.filter((item) => {
    const value = item[key];
    if (!value || seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}
