# Unraid + Telegram workflows for n8n

[![CI](https://github.com/SilentJMA/n8n-unraid-telegram-workflows/actions/workflows/ci.yml/badge.svg)](https://github.com/SilentJMA/n8n-unraid-telegram-workflows/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/SilentJMA/n8n-unraid-telegram-workflows)](https://github.com/SilentJMA/n8n-unraid-telegram-workflows/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-support-FFDD00?logo=buymeacoffee&logoColor=black)](https://www.buymeacoffee.com/kilwanitrod)

Monitor and manage an **Unraid** server from **Telegram**, using three n8n workflows built **only from n8n's built-in nodes** (Schedule, HTTP Request, Code, IF, Set, Telegram). No community node is needed, so they can be imported anywhere and shared in template galleries.

- 🔔 **Alerts**: new syslog errors and health problems arrive in Telegram with **suggested next steps** and one-tap follow-up commands.
- 🐳 **Docker**: a weekly update window, plus `/updates`, `/update_<name>`, `/restart_<name>`, `/logs_<name>`… from your phone.
- 🖥️ **Sysadmin**: `/status`, `/info`, `/disks`, `/parity`, `/syslog`, `/notifications`, `/vms`.

They talk to the official [Unraid API](https://docs.unraid.net/API/) (GraphQL, Unraid 7.2+ or the Unraid Connect plugin).

> Prefer a dedicated node? The same logic ships as the community node package [`@silentjma/n8n-nodes-unraid`](https://github.com/SilentJMA/n8n-nodes-unraid). It adds an Unraid action node, an Unraid Trigger, and versions of these workflows built on them.

## The workflows

| File | Triggers | What it does |
| --- | --- | --- |
| [unraid-alerts.json](workflows/unraid-alerts.json) | Every minute and every 5 minutes | Every minute it reads only the **new** lines of `/var/log/syslog` and keeps those rated *warning* or worse. Every 5 minutes it runs the **health checks**: array state, disabled, hot or full disks, SMART, parity errors, stopped autostart containers, memory, and unread Unraid alerts. Each new problem goes to Telegram once, with next steps. Repeats are throttled. An unreachable API raises its own alert. Optional extras: an Unraid notification as well, automatic restart of stopped autostart containers, and AI triage with any chat model. |
| [unraid-docker.json](workflows/unraid-docker.json) | Sunday 04:00, and called by the bot | Refreshes image digests and updates every container that has a new image, except `cfg.excludeFromUpdates`. It reports only when something changed. Also answers the Docker commands. |
| [unraid-sysadmin-bot.json](workflows/unraid-sysadmin-bot.json) | Telegram Trigger | The bot. Answers the sysadmin commands and forwards Docker commands to the Docker workflow. Only allowed chat IDs are served. |

A Telegram bot delivers its updates to a single webhook, so **only the bot workflow has a Telegram Trigger**. The other two only send messages.

### What the rules catch

The rules match **log lines** for:
- disk I/O and cabling errors
- filesystem corruption (XFS, BTRFS, ZFS)
- out-of-memory kills
- machine-check and PCIe errors
- kernel call traces (including macvlan)
- full disks and docker.img
- parity errors
- failed logins
- segfaults
- Docker errors
- network link drops
- thermal throttling
- application fatal errors and database corruption

The **health checks** look at:
- array state and disk status (disabled, missing, invalid)
- read/write errors
- temperature, with separate HDD and SSD thresholds
- disk usage
- SMART
- parity results
- stopped autostart containers and available updates
- memory and CPU load
- unread Unraid warnings and alerts

Every finding comes with concrete next steps.

## Commands

| Server | Docker |
| --- | --- |
| `/status`: health report with next steps | `/containers`: list with quick actions |
| `/info`: uptime, CPU, RAM, array usage | `/updates`: check for image updates |
| `/disks`: status, temperature, usage, errors | `/update_all`: update all (asks first) |
| `/parity`, `/parity_start` (asks first), `/parity_pause`, `/parity_resume`, `/parity_cancel` | `/update_<name>`, `/restart_<name>`, `/start_<name>` |
| `/syslog`: recent warnings with next steps | `/stop_<name>` (asks first) |
| `/notifications`, `/archive_all` | `/logs_<name>`: last lines, analysed |
| `/vms`, `/help` | |

Telegram commands allow only `a-z0-9_`, so container names are written with underscores: `Plex-Media-Server` becomes `/logs_plex_media_server`. Actions that ask first reply with a `…_confirm` command to tap.

## Setup

1. **Unraid API key:** in **Settings › Management Access › API Keys**, create a key with the **admin** role. Updates and restarts need admin.
2. **n8n credentials:**
   - **Header Auth:** Name `x-api-key`, Value = the key.
   - **Telegram:** the token of a bot made with @BotFather.
3. **Import** the three JSON files. In each workflow, select the Header Auth credential in the **Unraid API** HTTP nodes and the Telegram credential in the Telegram nodes.
4. **Settings:** set `cfg.unraidUrl` (e.g. `https://192.168.1.10`) in each workflow's settings node (*Alert settings*, *Settings*, *Bot settings*). Use https: Unraid redirects http, and the POST body is lost. The HTTP nodes accept the self-signed certificate.
5. **Bot workflow:** publish it, then message your bot. While `cfg.allowedChatIds` is empty, it only replies with your chat ID. Put that ID in **Bot settings › cfg.allowedChatIds** and in `cfg.telegramChatId` of the other two workflows.
6. In the bot's **Run Docker workflow** node, pick *Unraid · Docker updates & actions*. Then publish the Docker and Alerts workflows.
7. Optional: send @BotFather `/setcommands` with:
   ```text
   status - Health report with next steps
   info - Uptime, CPU, RAM, array usage
   disks - Disk status and temperatures
   containers - Docker containers with quick actions
   updates - Check for container updates
   syslog - Recent syslog warnings
   parity - Parity check status
   notifications - Unread Unraid notifications
   help - All commands
   ```

Keep **n8n** in `cfg.excludeFromUpdates` if n8n runs on the same server. Updating it recreates the container that is running the workflow, so the run is cut off.

## How it works

The Code nodes carry a bundled copy of the rules and a small command engine:
- [lib/](lib/) holds the rules, vendored from the node package.
- [src/engine.js](src/engine.js) holds the engine.

Each command is planned in a **Plan** node, which either replies right away or produces a GraphQL request. Up to three **Unraid API** HTTP calls follow, each one fed into a **Step** node. State such as the syslog position and the problems already reported lives in workflow static data.

## Development

```bash
npm run build      # regenerate workflows/*.json from src/ and lib/
npm run check      # structure checks
npm test           # engine unit tests
npm run simulate   # run every workflow against a mocked Unraid API
```

See [AGENT.md](AGENT.md) for the maintenance and release procedure.

## Support and contributing

- **Questions:** [Discussions › Q&A](https://github.com/SilentJMA/n8n-unraid-telegram-workflows/discussions/categories/q-a). Common problems are listed in [SUPPORT.md](SUPPORT.md).
- **Bugs and ideas:** [open an issue](https://github.com/SilentJMA/n8n-unraid-telegram-workflows/issues/new/choose). Never paste API keys or tokens.
- **Security:** report privately, see [SECURITY.md](SECURITY.md).
- **Contributing:** read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

If these workflows save you time, you can support the project:

<a href="https://www.buymeacoffee.com/kilwanitrod"><img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=%E2%98%95&slug=kilwanitrod&button_colour=FFDD00&font_colour=000000&font_family=Inter&outline_colour=000000&coffee_colour=ffffff" alt="Buy me a coffee" height="40"></a>

## License

[MIT](LICENSE). Not affiliated with or endorsed by Lime Technology / Unraid.
