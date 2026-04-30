import { createServer } from "node:http";
import { once } from "node:events";
import { discoverPage, fetchJson, fetchUrl, getRobotsTxt } from "../src/fetcher-core.js";
import { runFetcherFunction } from "../src/function-host.js";

process.env.FETCHER_ALLOW_PRIVATE = "true";

const server = createServer((request, response) => {
  if (request.url === "/json") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ result: { items: [{ name: "ok" }] } }));
    return;
  }
  if (request.url?.startsWith("/suggest/")) {
    const id = request.url.split("/").pop();
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ id, title: `Title ${id}` }));
    return;
  }
  if (request.url === "/blocked") {
    response.writeHead(403, {
      "content-type": "text/html; charset=utf-8",
      server: "cloudflare",
      "cf-ray": "smoke-test"
    });
    response.end("<title>Attention Required! | Cloudflare</title><div class=\"g-recaptcha\">Verify you are human</div>");
    return;
  }
  if (request.url === "/robots.txt") {
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end(`User-agent: *
Disallow: /private
Allow: /public

User-agent: ExampleBot
Disallow: /tmp
Sitemap: http://example.test/sitemap.xml`);
    return;
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(`<!doctype html>
    <title>Fetcher Smoke</title>
    <meta name="description" content="smoke test">
    <meta property="og:title" content="Smoke OG Title">
    <meta property="og:type" content="website">
    <meta property="og:image" content="/assets/preview.png">
    <meta property="og:image:alt" content="Preview image">
    <a href="/json">JSON endpoint</a>
    <a href="/title/tt0000001/">Title 1</a>
    <a href="/title/tt0000001/">Title 1 duplicate</a>
    <a href="/title/tt0000002/">Title 2</a>
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage","name":"Fetcher Smoke"}</script>
    <script src="/assets/app.js"></script>
    <script>window.api = "/api/products/search";</script>
    <form method="post" action="/submit"><input name="query"></form>`);
});

server.listen(0, "127.0.0.1");
await once(server, "listening");
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;

try {
  const fetched = await fetchUrl({ url: `${baseUrl}/`, responseType: "text" });
  if (!fetched.text.includes("Fetcher Smoke")) {
    throw new Error("fetch_url did not return expected HTML.");
  }
  if (fetched.challenge.detected) {
    throw new Error("fetch_url flagged a normal page as challenged.");
  }

  const blocked = await fetchUrl({ url: `${baseUrl}/blocked`, responseType: "text" });
  if (!blocked.challenge.detected || !blocked.challenge.categories.includes("captcha") || !blocked.challenge.categories.includes("cloudflare")) {
    throw new Error("fetch_url did not flag CAPTCHA/Cloudflare challenge signals.");
  }

  process.env.FETCHER_ALLOW_AUTH_HEADER = "false";
  try {
    await fetchUrl({
      url: `${baseUrl}/`,
      headers: { authorization: "Bearer smoke-test" },
      responseType: "text"
    });
    throw new Error("Authorization header was allowed when FETCHER_ALLOW_AUTH_HEADER=false.");
  } catch (error) {
    if (!String(error.message).includes("Authorization header is blocked")) {
      throw error;
    }
  } finally {
    delete process.env.FETCHER_ALLOW_AUTH_HEADER;
  }

  const json = await fetchJson({ url: `${baseUrl}/json`, path: "result.items[0].name" });
  if (json.selected !== "ok") {
    throw new Error("fetch_json path selection failed.");
  }

  const discovered = await discoverPage({ url: `${baseUrl}/` });
  if (!discovered.links.some((link) => link.href.endsWith("/json"))) {
    throw new Error("discover_page did not find the JSON link.");
  }
  if (!discovered.endpoints.some((endpoint) => endpoint.endsWith("/api/products/search"))) {
    throw new Error("discover_page did not find inline endpoint.");
  }
  if (!discovered.jsonLd.some((entry) => entry.name === "Fetcher Smoke")) {
    throw new Error("discover_page did not extract JSON-LD.");
  }
  if (discovered.openGraph.title !== "Smoke OG Title" || !discovered.openGraph.images.some((image) => image.url.endsWith("/assets/preview.png"))) {
    throw new Error("discover_page did not extract OpenGraph metadata.");
  }

  const robots = await getRobotsTxt({ host: `127.0.0.1:${port}`, protocol: "http:" });
  if (!robots.sections.some((section) => section.userAgents.includes("*") && section.disallow.includes("/private") && section.allow.includes("/public"))) {
    throw new Error("getRobotsTxt did not parse the default robots.txt section.");
  }
  if (!robots.sitemaps.includes("http://example.test/sitemap.xml")) {
    throw new Error("getRobotsTxt did not parse sitemap entries.");
  }

  const functionResult = await runFetcherFunction({
    definition: {
      name: "smoke-json-workflow",
      inputSchema: {
        baseUrl: { required: true },
        query: { required: true }
      },
      steps: [
        {
          id: "api",
          op: "fetch_json",
          input: {
            url: "{{baseUrl}}/json"
          }
        },
        {
          id: "name",
          op: "json_path",
          from: "steps.api.json",
          path: "result.items[0].name"
        },
        {
          id: "initial",
          op: "template",
          value: "{{query|lower|firstchar}}"
        }
      ],
      returns: {
        name: "$steps.name",
        initial: "$steps.initial"
      }
    },
    args: { baseUrl, query: "Breaking Bad" }
  });
  if (functionResult.result.name !== "ok" || functionResult.result.initial !== "b") {
    throw new Error("run_fetcher_function workflow test failed.");
  }

  const batchResult = await runFetcherFunction({
    definition: {
      name: "smoke-batch-json-workflow",
      inputSchema: {
        baseUrl: { required: true }
      },
      steps: [
        {
          id: "page",
          op: "fetch_url",
          input: {
            url: "{{baseUrl}}/",
            responseType: "text"
          }
        },
        {
          id: "ids",
          op: "regex",
          from: "steps.page.text",
          pattern: "\\/title\\/(tt\\d+)\\/",
          group: 1
        },
        {
          id: "uniqueIds",
          op: "unique",
          from: "steps.ids",
          maxItems: 2
        },
        {
          id: "details",
          op: "fetch_each_json",
          from: "steps.uniqueIds",
          input: {
            url: "{{baseUrl}}/suggest/{{item}}"
          },
          maxItems: 2,
          concurrency: 2
        },
        {
          id: "titles",
          op: "map",
          from: "steps.details",
          value: "$item.json.title"
        }
      ],
      returns: {
        ids: "$steps.uniqueIds",
        titles: "$steps.titles"
      }
    },
    args: { baseUrl }
  });
  if (batchResult.result.ids.length !== 2 || batchResult.result.titles[0] !== "Title tt0000001") {
    throw new Error("batch fetch workflow test failed.");
  }

  console.log("waFetchMCP smoke test passed.");
} finally {
  server.close();
}
