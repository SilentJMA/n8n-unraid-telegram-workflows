# Security policy

These workflows can update and restart Docker containers and start parity checks on an Unraid server, controlled from Telegram. Please handle security problems carefully.

## Reporting a vulnerability

**Do not open a public issue.** Instead:
1. Go to [Report a vulnerability](https://github.com/SilentJMA/n8n-unraid-telegram-workflows/security/advisories/new) (GitHub private advisory).
2. Describe the problem, its impact and how to reproduce it. Use a test server, a test bot and fake keys.

You'll get a reply within 7 days. The fix is shipped in the latest release, and you'll be credited unless you'd rather not be.

## In scope

- A Telegram chat that is not in `cfg.allowedChatIds` getting answers or running commands.
- Destructive actions running without the `_confirm` step.
- Injection through Telegram messages into GraphQL requests or messages (HTML).
- Secrets (API key, bot token) ending up in Telegram messages or execution data that is shown to users.

## Out of scope

- Vulnerabilities in Unraid, n8n or Telegram themselves. Report those upstream.
- Exposing n8n or the Unraid WebGUI to the internet without protection.

## Hardening tips

- Always set `cfg.allowedChatIds`. Use a bot that is only for this purpose.
- Give the API key only the roles it needs.
- Keep the Unraid WebGUI and API off the internet.
- Revoke any key that was ever pasted somewhere public.
