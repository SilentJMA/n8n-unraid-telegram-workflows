# Contributing

Thanks for helping improve the Unraid + Telegram workflows! New commands, better alerts, bug fixes and docs are all welcome.

## Ways to help

| You want to… | Do this |
|---|---|
| Ask a question or get help | Start a [Discussion (Q&A)](https://github.com/SilentJMA/n8n-unraid-telegram-workflows/discussions/categories/q-a). See [SUPPORT.md](SUPPORT.md). |
| Report a bug | Open a [bug report](https://github.com/SilentJMA/n8n-unraid-telegram-workflows/issues/new?template=bug_report.yml) with versions and the failing execution's error |
| Suggest a command or alert | Open a [feature request](https://github.com/SilentJMA/n8n-unraid-telegram-workflows/issues/new?template=feature_request.yml) |
| Report a security problem | Report it **privately** as described in [SECURITY.md](SECURITY.md) |
| Change the log or health rules | Contribute to [n8n-nodes-unraid](https://github.com/SilentJMA/n8n-nodes-unraid). This repo vendors those rules. |

**Never post API keys, Telegram tokens or passwords** in issues, discussions or pull requests.

## Development

Requirements: Node.js 20.19+. There are no npm dependencies.

```bash
git clone https://github.com/SilentJMA/n8n-unraid-telegram-workflows.git
cd n8n-unraid-telegram-workflows
npm run build      # regenerate workflows/*.json
npm run check && npm test && npm run simulate
```

[AGENT.md](AGENT.md) explains the architecture and the rules. The essentials:

1. **Never edit `workflows/*.json` by hand.** Change `src/engine.js` (behaviour and messages) or `scripts/build-workflows.mjs` (nodes and wiring), then run `npm run build`. CI fails if the JSON is stale.
2. **Built-in nodes only.** No community nodes. `npm run check` enforces this.
3. **Keep the safety rules.** Only allowed chat IDs get answers. Destructive actions ask for `_confirm`. Every dynamic value in a Telegram message goes through `esc()`.
4. **Test it.** Add a scenario to `scripts/simulate.cjs` for each new command or behaviour, and a unit test in `tests/` for engine logic.
5. **Update the changelog.** Add a line under **Unreleased** in `CHANGELOG.md`.

## Releases

1. A maintainer bumps `version` in `package.json` and moves the **Unreleased** entries under the new version.
2. They push a `v<version>` tag.
3. The [release workflow](.github/workflows/release.yml) runs every gate and attaches the three workflow files to the GitHub release.

## Code of conduct

Everyone taking part agrees to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Support the project

If these workflows save you time, you can [buy me a coffee](https://www.buymeacoffee.com/kilwanitrod) ☕.
