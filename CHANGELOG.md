# Changelog

## 0.1.0 - 2026-10-25

First release: three Unraid workflows managed from Telegram, built only from n8n's built-in nodes.

- **Alerts**:
  - Every minute, syslog lines rated warning or worse.
  - Every 5 minutes, health checks: array, disks, SMART, parity, containers, memory, Unraid alerts.
  - Telegram messages with next steps and tappable commands.
  - Throttled per alert key, with an alert when the API is unreachable.
  - Optional: Unraid notification, auto-restart of stopped autostart containers, AI triage with any chat model.
- **Docker updates & actions**:
  - A weekly update window with exclusions, quiet when nothing changed.
  - Commands: `/containers`, `/updates`, `/update_all`, `/update_<name>`, `/restart_<name>`, `/start_<name>`, `/stop_<name>` and `/logs_<name>`.
- **Sysadmin & Telegram bot**:
  - Commands: `/status`, `/info`, `/disks`, `/parity` (+ start/pause/resume/cancel), `/syslog`, `/notifications`, `/archive_all`, `/vms` and `/help`.
  - A reply-keyboard menu, an allow-list of chat IDs, and confirmation for destructive actions.
