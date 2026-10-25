# Getting help

1. **Read the [README](README.md)**, especially the Setup section.
2. **Search** the existing [issues](https://github.com/SilentJMA/n8n-unraid-telegram-workflows/issues?q=is%3Aissue) and [discussions](https://github.com/SilentJMA/n8n-unraid-telegram-workflows/discussions).
3. **Ask in [Discussions › Q&A](https://github.com/SilentJMA/n8n-unraid-telegram-workflows/discussions/categories/q-a).** Include the workflow release, your n8n version and your Unraid version.
4. **Open a [bug report](https://github.com/SilentJMA/n8n-unraid-telegram-workflows/issues/new?template=bug_report.yml)** when something is clearly broken.

Support is community-based and best effort. **Never share API keys or bot tokens.**

## Common problems

| Symptom | Fix |
|---|---|
| Replies say *invalid or was revoked* | Create a new API key in **Settings › Management Access › API Keys** and update the Header Auth credential (Name `x-api-key`). |
| `Unraid API request failed` | `cfg.unraidUrl` must be `https://…`. Unraid redirects http, and the request body is lost. |
| *lacks permission* | Updates and restarts need the **admin** role on the API key. |
| Telegram Trigger fails to activate with *Bad request - please check your parameters* (the n8n log says `An HTTPS URL must be provided for webhook`) | Telegram only accepts public **HTTPS** webhook URLs, and n8n builds them from its own settings. On the n8n container, set **`N8N_WEBHOOK_URL=https://<your public n8n host>/`** and restart. Setting only `WEBHOOK_URL` is not enough: n8n 2.x builds *test* webhook URLs from `N8N_EDITOR_BASE_URL`, so they stay `http://…`. Then publish the bot workflow, and don't use the trigger's test button while it is published. |
| The bot does not answer | Publish the bot workflow, and make sure no other workflow has a Telegram Trigger for the same bot. Check your chat ID is in `cfg.allowedChatIds`. |
| Docker commands do nothing | In the bot's **Run Docker workflow** node, pick *Unraid · Docker updates & actions*, and publish that workflow too. |
| No syslog alerts at first | The first run only records where the log ends. Alerts start with the next new lines. |
| The weekly update stops halfway | Keep `n8n` in `cfg.excludeFromUpdates`. |

## Support the project

If this saves you time, [buy me a coffee](https://www.buymeacoffee.com/kilwanitrod) ☕.
