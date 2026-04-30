# waFetchMCP Workflow

## Flow

- start: User asks for data from a public website or API
- process: Agent chooses waFetchMCP when direct HTTP inspection is enough
- process: Check fetcher_status for limits and safety settings
- process: Run discover_page on the target page
- process: Inspect title, metadata, links, scripts, forms, endpoint strings, JSON-LD, OpenGraph, and challenge signals
- decision: Is repeated fetching or a reusable workflow needed?
  - yes: Run get_robots_txt for crawl guidance
  - no: Use fetch_url or fetch_json for a one-off result
- decision: Did discovery find a useful public endpoint or structured data?
  - yes: Fetch it with fetch_json or fetch_url
  - no: Inspect linked scripts or page HTML for stable public data sources
- process: Extract the required values with json_path, regex, map, or template steps
- decision: Should this become reusable?
  - yes: Save the declarative function with save_fetcher_function
  - no: Return the fetched result directly
- process: Run saved workflows later with run_fetcher_function
- end: Agent returns normalized data, trace details when requested, and any safety or challenge notes

