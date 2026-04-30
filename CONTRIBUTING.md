# Contributing

Contributions are welcome. Keep changes focused and include tests for behavior changes.

## Development

```bash
npm install
npm test
```

## Function Definitions

Saved functions in `functions/*.json` should be:

- Data-only JSON.
- Narrowly scoped to one website or API workflow.
- Documented with `description` and `inputSchema`.
- Covered by either a smoke test or a manual verification note in the pull request.

Avoid adding workflows that require credentials, bypass access controls, or fetch private network resources by default.

## Pull Requests

Before opening a pull request:

1. Run `npm test`.
2. Update `README.md` when behavior or configuration changes.
3. Keep generated or local-only files out of the commit.
