## What and why

<!-- What does this change, and which issue does it close? (Closes #…) -->

## Checklist

- [ ] `npm run build && npm run check && npm test && npm run simulate -- --quiet` passes
- [ ] `workflows/*.json` were regenerated with `npm run build`, not edited by hand
- [ ] New commands or behaviours have a scenario in `scripts/simulate.cjs`
- [ ] Destructive actions still ask for `_confirm`, and unauthorized chats still get no answer
- [ ] No node or `cfg.*` setting was renamed (or the change is called out in `CHANGELOG.md`)
- [ ] Rule changes were made in n8n-nodes-unraid and synced with `npm run sync-rules`
- [ ] `CHANGELOG.md` has an entry under **Unreleased**
- [ ] No API keys, tokens, hostnames or personal data in code, fixtures or screenshots
