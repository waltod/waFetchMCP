# Security Policy

waFetchMCP is a network-capable tool. Treat saved functions as executable automation definitions and review them before use.

## Supported Versions

Only the latest `main` branch is actively maintained until the first stable release.

## Defaults

- Private and local network fetches are blocked unless `FETCHER_ALLOW_PRIVATE=true`.
- `Authorization` headers are blocked unless `FETCHER_ALLOW_AUTH_HEADER=true`.
- Response reads are capped by `FETCHER_MAX_BYTES`.
- Request timeouts are enforced by `FETCHER_TIMEOUT_MS`.

## Reporting a Vulnerability

Open a private security advisory on GitHub or contact the repository maintainer directly. Include:

- A description of the issue.
- Reproduction steps.
- Impact.
- Suggested mitigation, if known.

Do not publish exploit details until a fix is available.
