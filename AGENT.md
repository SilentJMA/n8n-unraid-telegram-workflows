# AGENT.md: working on the Unraid + Telegram workflows

This repository publishes three n8n workflows that manage an Unraid server from Telegram. They use **only built-in n8n nodes**. The JSON files in `workflows/` are **generated**: never edit them by hand. Change the sources, regenerate, verify, release.

## Layout

| Path | Role |
|---|---|
| `src/engine.js` | Command engine: `parseCommand`, `sysPlan`/`sysStep`, `dockerPlan`/`dockerStep`, `syslogRequest`/`syslogResult`, `healthResult`, `apiError`. Plain CommonJS with no dependencies, unit-tested. |
| `lib/analysis.js`, `lib/logs.js`, `lib/queries.js` | Rules, log helpers and GraphQL documents, vendored from the compiled [`@silentjma/n8n-nodes-unraid`](https://github.com/SilentJMA/n8n-nodes-unraid). Do not edit here. |
| `scripts/build-workflows.mjs` | Generator. Inlines lib/ and the engine into Code nodes and writes `workflows/*.json` with stable node IDs. |
| `scripts/check-workflows.mjs` | Structural gate: connections, unique names, `$("…")` references, Code nodes parse, no `require()`, only built-in node types, exactly one Telegram Trigger (in the bot) |
| `scripts/simulate.cjs` | Runs all three workflows in a small executor against a mocked Unraid API (40 scenarios). Exit code 1 on failure. |
| `scripts/sync-rules.mjs` | Copies `dist/lib/{analysis,logs,queries}.js` from a built node-package checkout into `lib/` |
| `tests/engine.test.js` | `node:test` unit tests for the engine |

## How the generated workflows run

- Every Unraid call is an **HTTP Request** node (`POST {cfg.unraidUrl}/graphql`, Header Auth credential `x-api-key`, self-signed certificates allowed, `onError: continueRegularOutput`). The item it receives carries `cfg` and `request: { query, variables }`.
- Commands follow **plan → (Call API? → Unraid API n → Step n) × 3 → reply**. A plan or step that sets `request: null` and `text` goes straight to the reply. A step that returns `silent: true` ends the run without a message. Need more than three calls? Raise the loop count in `apiChain` and add a simulator scenario.
- Code nodes that need the engine get the whole bundle prepended. Small nodes get only the function they need, through `fn.toString()` plus constants, which keeps the files small. Anything inlined by `toString()` must be self-contained: it may use only the constants passed with it.
- Polling state (`syslogLast`, `healthKeys`, the `sent` throttle map) lives in `$getWorkflowStaticData('global')`. It persists only in production executions.

## Contract

- **Built-in nodes only.** `npm run check` fails on any other node type.
- **Stable names.** Node names are referenced by `$('…')` and appear in users' executions. Settings fields (`cfg.*`) are part of the setup instructions. Renaming either breaks existing imports, so it needs a changelog entry.
- **One Telegram Trigger**, in the bot workflow only. A bot has one webhook.
- **Commands are append-only.** Never change what an existing command does. Destructive actions (`/update_all`, `/stop_<name>`, `/parity_start`) must keep asking for a `_confirm` first.
- **Authorization first.** The bot must never run a command for a chat that is not in `cfg.allowedChatIds`. While the list is empty, it only answers with the sender's chat ID.
- **Telegram HTML.** Escape every dynamic value with `esc()`. Use only `<b> <i> <code> <pre>`. Keep messages under 4096 characters (`clip()`).
- **No secrets.** Fixtures use fake hosts (`tower.local`) and no real keys.

## Making a change

1. Edit `src/engine.js` (behaviour and formatting) or `scripts/build-workflows.mjs` (nodes and wiring).
2. When the rules or queries change in the node package, build that package, then run `npm run sync-rules -- <path to its checkout>`.
3. Run all gates:
   ```bash
   npm run build && npm run check && npm test && npm run simulate -- --quiet
   ```
4. Add or adjust a simulator scenario for every new command or behaviour. Each scenario states the message it expects.
5. Commit the regenerated `workflows/*.json` together with the source change. Use plain commit messages without trailers.

## Releasing

1. Bump `version` in `package.json` and add a dated section to `CHANGELOG.md`.
2. Run the gates.
3. Commit (`Release <v>`), tag and attach the workflows:
   ```bash
   git tag v<v> && git push origin main --tags
   gh release create v<v> workflows/*.json --title "v<v>" --notes-file <notes>
   ```

## Gotchas

- `http://` on servers with SSL enabled redirects to https, and the POST body is lost. `cfg.unraidUrl` must be https.
- Unraid answers a bad key with HTTP 200 and `errors[0].extensions.code = UNAUTHENTICATED`. `apiError()` turns that into a "revoked key" hint.
- `logFile` reads only files directly in `/var/log`. `startLine` is 1-based. A `totalLines` below the stored position means the log rotated, so the engine resets to 0 and reads from the top on the next run.
- Telegram commands allow only `[a-z0-9_]`. `cmd()` and `matchContainer()` must agree on the mapping.
- Keep `n8n` in the update exclusions. Updating it kills the running execution.
