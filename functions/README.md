# Bundled Fetcher Functions

This directory contains declarative workflow examples that can be listed with `list_fetcher_functions` or run with `run_fetcher_function`.

## Fandom

The bundled Fandom workflows use Fandom's public MediaWiki APIs instead of scraping rendered pages.

```bash
npm run cli -- run-function fandom-allpages --arg wiki=harrypotter --arg limit=3 --trace
npm run cli -- run-function fandom-page-html --arg wiki=harrypotter --arg "title=Harry Potter"
```

- `fandom-allpages` returns one batch of article titles and a continuation token.
- `fandom-page-html` returns parsed page HTML, display title, and links.

## LCSC-Style Catalogs

The bundled LCSC workflows use public no-key web endpoints that are already exercised by the local `lcsc-fetcher` scrape mode.

```bash
npm run cli -- run-function lcsc-search --arg keyword=C2980297
npm run cli -- run-function lcsc-product-detail --arg productCode=C2980297
npm run cli -- run-function lcsc-search-list --arg "keyword=ESPRESSIF ESP32-S3" --arg limit=5
```

- `lcsc-search` returns direct-match metadata for exact LCSC part numbers and raw product lists for broader search phrases.
- `lcsc-product-detail` returns normalized product identity, stock, attributes, and price breaks.
- `lcsc-search-list` returns a concise list with product code, MPN, manufacturer, category, package, stock, price breaks, product URL, datasheet URL, and image URL.

These examples also demonstrate the catalog workflow pattern: discover a search or product page, prefer public JSON endpoints or structured product metadata, then normalize fields with `json_path` and `map`.

Recommended flow:

1. Run `discover_page` on a catalog search or product URL.
2. Run `get_robots_txt` for crawl guidance, then check `challenge`, `jsonLd`, `openGraph`, and endpoint-like strings.
3. Use `fetch_json` for public API responses when available.
4. Save repeatable part-search or product-detail logic as a JSON function.

When challenge detection reports CAPTCHA, login, access denial, bot verification, or JavaScript verification, treat it as diagnostic output for the workflow author. waFetchMCP reports these signals but does not solve or bypass them.

## IMDb

IMDb title pages may return Amazon WAF challenge responses to direct HTTP clients. The bundled IMDb example uses IMDb's public no-key suggestion JSON endpoint instead of trying to bypass the HTML challenge.

```bash
npm run cli -- run-function imdb-title-search --arg "query=Breaking Bad" --arg limit=5 --trace
npm run cli -- run-function imdb-title-inspect --arg "query=Breaking Bad" --trace
npm run cli -- run-function imdb-title-suggestion --arg titleId=tt0133093 --trace
npm run cli -- run-function imdb-genre-scraper --arg filter=action --arg limit=5 --trace
```

- `imdb-title-search` searches IMDb's public suggestion endpoint by text and returns normalized matches.
- `imdb-title-inspect` resolves the top search result, then probes the title, episodes, and full-credit pages to surface structured data or challenge signals.
- `imdb-title-suggestion` returns one normalized title match with title, year, type, cast summary, rank, image metadata, and canonical IMDb URL.
- `imdb-genre-scraper` adapts [`Xplit495/imdb-scraper`](https://github.com/Xplit495/imdb-scraper): it discovers title ids from IMDb's genre chart page, deduplicates them, then enriches each through IMDb's public suggestion JSON endpoint.
- If a direct IMDb page fetch is attempted separately and returns an Amazon WAF challenge header, waFetchMCP reports it as a `bot_challenge` signal.

In environments where IMDb returns Amazon WAF challenges for chart pages, `imdb-genre-scraper` returns an empty movie list plus `chartChallenge` details. It does not bypass CAPTCHA, WAF, or browser-verification controls.
