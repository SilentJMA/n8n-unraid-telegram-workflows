// Command engine for the standalone Unraid workflows. The generator inlines this file (with lib/) into
// n8n Code nodes; tests require it directly. Lines tagged node-only are stripped when inlined.
'use strict';
const R = { ...require('../lib/analysis'), ...require('../lib/logs') }; // node-only
const { Q, M } = require('../lib/queries'); // node-only

// ------------------------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Telegram commands allow only [a-z0-9_]: "Plex-Media-Server" -> plex_media_server. */
const cmd = (n) => String(n ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const clip = (s, n = 3900) => (s.length > n ? s.slice(0, n - 20) + '\n…(truncated)' : s);
const nameOf = (c) => R.containerName(c);

/** Error text for a failed HTTP call or a GraphQL error response, or null when the call worked. */
function apiError(res) {
	if (!res) return 'No response from the Unraid API';
	if (res.error) {
		const e = res.error;
		return `Unraid API request failed: ${e.message ?? e.description ?? JSON.stringify(e)}`;
	}
	if (Array.isArray(res.errors) && res.errors.length) {
		const msg = res.errors.map((e) => (e.path?.length ? `${e.path.join('.')}: ${e.message}` : e.message)).join('; ');
		const code = res.errors[0]?.extensions?.code;
		if (code === 'UNAUTHENTICATED') return `${msg} — the API key is invalid or was revoked; update the Unraid header credential.`;
		if (code === 'FORBIDDEN') return `${msg} — the API key lacks permission; give it the admin role.`;
		return msg;
	}
	if (!res.data) return 'Unraid API returned no data';
	return null;
}

function matchContainer(list, value) {
	const v = String(value).trim();
	const lower = v.replace(/^\//, '').toLowerCase();
	return (
		list.find((c) => c.id === v || c.id.endsWith(`:${v}`)) ??
		list.find((c) => nameOf(c).toLowerCase() === lower) ??
		list.find((c) => cmd(nameOf(c)) === cmd(v))
	);
}

const done = (s, text) => ({ ...s, request: null, text });
const next = (s, stage, request) => ({ ...s, stage, request });

// ------------------------------------------------------------------------------------------------
// Telegram bot: parse
// ------------------------------------------------------------------------------------------------
const PREFIXED = ['update', 'restart', 'start', 'stop', 'logs', 'parity', 'archive'];
const DOCKER = ['containers', 'updates', 'update', 'restart', 'start', 'stop', 'logs'];

/** "/restart_plex_media_server" -> { command: 'restart', arg: 'plex_media_server' }; "_confirm" confirms. */
function parseCommand(j) {
	const msg = j.message ?? {};
	const chatId = String(msg.chat?.id ?? '');
	const allowed = String(j.cfg?.allowedChatIds ?? '').split(',').map((s) => s.trim()).filter(Boolean);
	const text = String(msg.text ?? '').trim();
	let [head = '', ...rest] = text.replace(/^\//, '').split(/\s+/);
	head = head.replace(/@\w+$/, '').toLowerCase();
	let confirmed = rest.includes('confirm');
	rest = rest.filter((r) => r !== 'confirm');
	if (head.endsWith('_confirm')) {
		confirmed = true;
		head = head.slice(0, -'_confirm'.length);
	}
	let command = text.startsWith('/') ? head : 'help';
	let arg = rest.join(' ');
	const i = head.indexOf('_');
	if (i > 0 && PREFIXED.includes(head.slice(0, i))) {
		command = head.slice(0, i);
		arg = [head.slice(i + 1), arg].filter(Boolean).join(' ');
	}
	if (command === 'start' && !arg) command = 'help'; // Telegram's "start bot"
	return {
		chatId,
		text,
		command,
		arg,
		confirmed,
		cfg: j.cfg,
		group: DOCKER.includes(command) ? 'docker' : command,
		authorized: allowed.includes(chatId),
		configured: allowed.length > 0,
	};
}

const HELP = [
	'<b>Server</b>\n/status — health report with next steps\n/info — uptime, CPU, RAM, array usage\n/disks — disk status, temps, usage\n/parity — parity status (/parity_start, /parity_pause, /parity_resume, /parity_cancel)\n/syslog — recent warnings in the syslog\n/notifications — unread Unraid notifications (/archive_all)\n/vms — virtual machines',
	'<b>Docker</b>\n/containers — list with quick actions\n/updates — check for image updates\n/update_all — update everything (asks first)\n/update_&lt;name&gt; · /restart_&lt;name&gt; · /start_&lt;name&gt; · /stop_&lt;name&gt; · /logs_&lt;name&gt;',
];

// ------------------------------------------------------------------------------------------------
// Sysadmin commands
// ------------------------------------------------------------------------------------------------
const INFO_QUERY = `{
	info { os { hostname distro release uptime } cpu { brand cores threads } }
	metrics { cpu { percentTotal } memory { total available percentTotal } }
	array { state capacity { kilobytes { used total } } }
}`;

function sysPlan(p) {
	const s = { chatId: p.chatId, cfg: p.cfg, command: p.command, arg: p.arg, group: p.group, request: null };
	switch (p.group) {
		case 'status':
			return next(s, 'status', { query: Q.health });
		case 'info':
			return next(s, 'info', { query: INFO_QUERY });
		case 'disks':
			return next(s, 'disks', { query: Q.array });
		case 'parity': {
			const action = ['start', 'pause', 'resume', 'cancel'].includes(p.arg) ? p.arg : 'status';
			if (action === 'status') return next(s, 'parity', { query: Q.parityHistory });
			if (action === 'start' && !p.confirmed) {
				return done(s, '⚠️ Start a (non-correcting) parity check? It reads every disk for many hours.\nTap /parity_start_confirm to proceed.');
			}
			const mutation = { start: M.parityStart, pause: M.parityPause, resume: M.parityResume, cancel: M.parityCancel }[action];
			return next({ ...s, parityAction: action }, 'parity.op', { query: mutation, variables: action === 'start' ? { correct: false } : {} });
		}
		case 'syslog':
			return next(s, 'syslog', { query: Q.logFile, variables: { path: '/var/log/syslog', lines: 2000 } });
		case 'notifications':
			return next(s, 'notifications', { query: Q.notifications, variables: { filter: { type: 'UNREAD', offset: 0, limit: 10 } } });
		case 'archive':
			return next(s, 'archive', { query: M.archiveAll, variables: {} });
		case 'vms':
			return next(s, 'vms', { query: Q.vms });
		case 'help':
			return { ...done(s, `🖥️ <b>Unraid bot</b>\n\n${HELP.join('\n\n')}`), menu: true };
		default:
			return { ...done(s, `❓ Unknown command <code>${esc(p.text)}</code>\n\n${HELP.join('\n\n')}`), menu: true };
	}
}

const SEV_ICON = { ok: '✅', info: '🔵', warning: '🟠', critical: '🔴' };

function sysStep(s, res) {
	const err = apiError(res);
	if (err) return done(s, `❌ ${esc(err)}`);
	const d = res.data;
	switch (s.stage) {
		case 'status': {
			const findings = R.analyzeHealth(d);
			const sum = R.summarizeFindings(findings);
			const lines = findings.slice(0, 8).map((f) => {
				const a = f.suggestedAction;
				const action = a?.resource === 'dockerContainer' && a.name ? `  /${a.operation}_${cmd(a.name)}` : '';
				return `${SEV_ICON[f.severity]} <b>${esc(f.title)}</b>${action}\n    → ${esc(f.nextSteps?.[0] ?? '')}`;
			});
			return done(s, clip([
				`${SEV_ICON[sum.status]} <b>${esc(d.info?.os?.hostname)}</b> — ${sum.status} · array ${esc(String(d.array?.state).toLowerCase())}`,
				`${sum.counts.critical} critical · ${sum.counts.warning} warning · ${sum.counts.info} info`,
				lines.join('\n') || 'No problems found.',
				'/info  /disks  /syslog  /containers',
			].join('\n\n')));
		}
		case 'info': {
			const { info, metrics: m, array: a } = d;
			const gb = (b) => (Number(b) / 1024 ** 3).toFixed(1);
			const tb = (kb) => (Number(kb) / 1024 ** 3).toFixed(2);
			const up = info.os?.uptime ? Math.floor((Date.now() - new Date(info.os.uptime)) / 3600000) : null;
			const kb = a?.capacity?.kilobytes ?? {};
			return done(s, [
				`🖥️ <b>${esc(info.os?.hostname)}</b> — ${esc(info.os?.distro)} ${esc(info.os?.release)}`,
				up !== null ? `⏱️ Up ${Math.floor(up / 24)}d ${up % 24}h` : '',
				`🧠 ${esc(info.cpu?.brand)} — ${info.cpu?.cores}C/${info.cpu?.threads}T · load ${Math.round(m?.cpu?.percentTotal ?? 0)}%`,
				m?.memory ? `💾 RAM ${Math.round(m.memory.percentTotal)}% of ${gb(m.memory.total)} GB (available ${gb(m.memory.available)} GB)` : '',
				kb.total ? `🗄️ Array ${esc(String(a.state).toLowerCase())} — ${tb(kb.used)} / ${tb(kb.total)} TB used (${Math.round((kb.used / kb.total) * 100)}%)` : '',
			].filter(Boolean).join('\n'));
		}
		case 'disks': {
			const a = d.array;
			const line = (x) => {
				const used = x.fsSize ? Math.round((Number(x.fsUsed) / Number(x.fsSize)) * 100) + '%' : '';
				const temp = x.temp === null || x.temp === undefined ? (x.isSpinning === false ? '💤' : '–') : x.temp + '°C';
				const ok = x.status === 'DISK_OK';
				const errs = Number(x.numErrors) > 0 ? ` · ⚠️ ${x.numErrors} errors` : '';
				return `${ok ? '🟢' : '🔴'} <b>${esc(x.name)}</b> (${esc(x.device ?? '')}) ${temp}${used ? ' · ' + used + ' used' : ''}${ok ? '' : ' · ' + esc(x.status)}${errs}`;
			};
			const group = (title, list) => (list?.length ? `<b>${title}</b>\n` + list.map(line).join('\n') : '');
			const p = a.parityCheckStatus ?? {};
			return done(s, clip([
				`💽 Array <b>${esc(String(a.state).toLowerCase())}</b>`,
				group('Parity', a.parities),
				group('Data', a.disks),
				group('Pools', a.caches),
				`Parity check: ${esc(String(p.status ?? 'unknown').toLowerCase())}${p.running ? ` (${p.progress}%)` : ''}${p.date ? ' · last ' + new Date(p.date).toISOString().slice(0, 10) : ''}${p.errors ? ' · ' + p.errors + ' errors' : ''}`,
				'/parity  /syslog  /status',
			].filter(Boolean).join('\n\n')));
		}
		case 'parity': {
			const runs = (d.parityHistory ?? []).filter((r) => r.date).sort((a, b) => String(b.date).localeCompare(String(a.date)));
			const fmt = (r) => `• ${new Date(r.date).toISOString().slice(0, 10)} — ${esc(String(r.status).toLowerCase())}, ${Math.round((r.duration ?? 0) / 3600)}h, ${r.errors ?? 0} errors${r.running ? ` (running ${r.progress}%)` : ''}`;
			return done(s, ['🧮 <b>Parity checks</b>', runs.slice(0, 5).map(fmt).join('\n') || 'No parity history.', '/parity_start  /parity_pause  /parity_resume  /parity_cancel'].join('\n\n'));
		}
		case 'parity.op':
			return done(s, `✅ Parity check: ${esc(s.parityAction)} sent. Check progress with /parity`);
		case 'syslog': {
			const f = d.logFile;
			const lines = R.filterLogLines(R.splitLogContent(f.content, f.startLine), { analyze: true, minSeverity: 'warning' });
			if (!lines.length) return done(s, '✅ No warnings in the last 2000 syslog lines.');
			const mark = { critical: '🔴', warning: '🟠' };
			const byCat = {};
			for (const l of lines) byCat[l.category] = (byCat[l.category] ?? 0) + 1;
			let body = lines.slice(-12).map((l) => `${mark[l.severity] ?? ''} ${l.line}`).join('\n');
			if (body.length > 2800) body = '…' + body.slice(-2800);
			const steps = [...new Set(lines.filter((l) => l.severity === 'critical').flatMap((l) => l.nextSteps ?? []))].slice(0, 3);
			return done(s, clip([
				`📋 <b>Syslog</b>: ${lines.length} warning/critical line(s) in the last 2000 lines`,
				Object.entries(byCat).map(([c, n]) => `${esc(c)}: ${n}`).join(' · '),
				`<pre>${esc(body)}</pre>`,
				steps.length ? '<b>Next steps</b>\n' + steps.map((x, i) => `${i + 1}. ${esc(x)}`).join('\n') : '',
			].filter(Boolean).join('\n\n')));
		}
		case 'notifications': {
			const list = d.notifications?.list ?? [];
			const icon = { ALERT: '🔴', WARNING: '🟠', INFO: '🔵' };
			return done(s, list.length
				? clip(`🔔 <b>${list.length} unread notification(s)</b>\n\n` + list.map((n) => `${icon[n.importance] ?? '⚪'} <b>${esc(n.subject)}</b>\n    ${esc(n.description)} <i>(${esc(n.formattedTimestamp ?? n.timestamp ?? '')})</i>`).join('\n') + '\n\nArchive all: /archive_all')
				: '✅ No unread notifications.');
		}
		case 'archive': {
			const o = d.archiveAll ?? {};
			return done(s, `🗂️ Archived. Unread now: ${o.unread?.total ?? 0}, archived: ${o.archive?.total ?? '?'}`);
		}
		case 'vms': {
			const list = d.vms?.domains ?? [];
			return done(s, list.length
				? '🖥️ <b>Virtual machines</b>\n' + list.map((v) => `${v.state === 'RUNNING' ? '🟢' : '⚪'} <b>${esc(v.name)}</b> — ${esc(String(v.state).toLowerCase())}`).join('\n')
				: 'No virtual machines defined.');
		}
		default:
			return done(s, `❌ Unknown stage ${esc(s.stage)}`);
	}
}

// ------------------------------------------------------------------------------------------------
// Docker commands + weekly update window
// ------------------------------------------------------------------------------------------------
function dockerPlan(j) {
	const chatId = j.chatId || j.cfg?.telegramChatId;
	const command = j.command || 'scheduled';
	const arg = String(j.arg ?? '').trim();
	const s = { chatId, command, arg, scheduled: !j.command, cfg: j.cfg, request: null };
	const usage = (c) => done(s, `Usage: /${c}_&lt;container&gt; — see /containers`);
	const resolveFirst = (action, extra = {}) => next({ ...s, action, ...extra }, `${action}.resolved`, { query: Q.containerNames });
	if (command === 'scheduled') return next({ ...s, action: 'updateAll' }, 'updateAll.refreshed', { query: M.dockerRefreshDigests });
	if (command === 'containers') return next({ ...s, action: 'list' }, 'list', { query: Q.containers });
	if (command === 'updates') return next({ ...s, action: 'updates' }, 'updates.refreshed', { query: M.dockerRefreshDigests });
	if (command === 'update') {
		if (!arg) return usage('update');
		if (arg === 'all') {
			return j.confirmed
				? next({ ...s, action: 'updateAll' }, 'updateAll.refreshed', { query: M.dockerRefreshDigests })
				: done(s, '⚠️ Update every container that has an update (except excluded ones)?\nTap /update_all_confirm to proceed.');
		}
		return resolveFirst('update', { names: arg.split(/[\s,]+/).filter(Boolean) });
	}
	if (['restart', 'start', 'stop', 'logs'].includes(command)) {
		if (!arg) return usage(command);
		if (command === 'stop' && !j.confirmed) return done(s, `⚠️ Stop <b>${esc(arg)}</b>?\nTap /stop_${cmd(arg)}_confirm to proceed.`);
		return resolveFirst(command, { names: [arg] });
	}
	return done(s, `Unknown Docker command /${esc(command)}. Try /help`);
}

function excludedSet(cfg) {
	return new Set(String(cfg?.excludeFromUpdates ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));
}

function fmtUpdated(s, updated) {
	const skippedLine = s.skipped?.length ? `\nSkipped (excluded): ${esc(s.skipped.join(', '))}` : '';
	const lines = updated.map((c) => `• <b>${esc(nameOf(c))}</b>: ${esc(String(c.state).toLowerCase())} (${esc(c.image)})`);
	return `⬆️ <b>Updated ${lines.length} container(s)</b>${s.scheduled ? ' (weekly window)' : ''}\n${lines.join('\n')}${skippedLine}`;
}

function dockerStep(s, res) {
	const err = apiError(res);
	if (err) return done(s, `❌ ${s.action === 'updateAll' || s.action === 'update' ? '<b>Update failed</b>\n' : ''}${esc(err)}`);
	const d = res.data;
	const containers = () => (d.docker?.containers ?? []);
	switch (s.stage) {
		case 'list': {
			const items = containers().slice().sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
			const icon = { RUNNING: '🟢', PAUSED: '⏸️', EXITED: '🔴' };
			const lines = items.map((c) => `${icon[c.state] ?? '⚪'} <b>${esc(nameOf(c))}</b>${c.isUpdateAvailable ? ' ⬆️' : ''} — ${esc(c.status)}\n    /logs_${cmd(nameOf(c))}  /restart_${cmd(nameOf(c))}${c.state === 'RUNNING' ? '' : '  /start_' + cmd(nameOf(c))}`);
			const running = items.filter((c) => c.state === 'RUNNING').length;
			return done(s, clip(`🐳 <b>${items.length} containers</b> (${running} running)\n\n${lines.join('\n')}`));
		}
		case 'updates.refreshed':
			return next(s, 'updates.statuses', { query: Q.containerUpdateStatuses });
		case 'updates.statuses': {
			const names = (d.docker?.containerUpdateStatuses ?? []).filter((x) => x.updateStatus === 'UPDATE_AVAILABLE').map((x) => x.name);
			return done(s, names.length
				? `⬆️ <b>${names.length} update(s) available</b>\n\n${names.map((n) => `• ${esc(n)}  /update_${cmd(n)}`).join('\n')}\n\nUpdate all (except excluded): /update_all`
				: '✅ All containers are up to date.');
		}
		case 'updateAll.refreshed':
			return next(s, 'updateAll.listed', { query: Q.containers });
		case 'updateAll.listed': {
			const excluded = excludedSet(s.cfg);
			const withUpdates = containers().filter((c) => c.isUpdateAvailable === true);
			const todo = withUpdates.filter((c) => !excluded.has(nameOf(c).toLowerCase()));
			const skipped = withUpdates.filter((c) => excluded.has(nameOf(c).toLowerCase())).map(nameOf);
			if (!todo.length) {
				if (s.scheduled) return { ...done(s, ''), silent: true };
				return done(s, `✅ Nothing to update.${skipped.length ? `\nSkipped (excluded): ${esc(skipped.join(', '))}` : ''}`);
			}
			return next({ ...s, skipped }, 'updated', { query: M.dockerUpdateMany, variables: { ids: todo.map((c) => c.id) } });
		}
		case 'updated':
			return done(s, fmtUpdated(s, d.docker?.updateContainers ?? []));
		case 'update.resolved':
		case 'restart.resolved':
		case 'start.resolved':
		case 'stop.resolved':
		case 'logs.resolved': {
			const list = containers();
			const ids = [];
			for (const n of s.names ?? []) {
				const m = matchContainer(list, n);
				if (!m) return done(s, `❌ ${esc(s.action)} <b>${esc(n)}</b> failed: no container with that name. See /containers`);
				ids.push(m.id);
			}
			if (s.action === 'update') return next(s, 'updated', { query: M.dockerUpdateMany, variables: { ids } });
			if (s.action === 'logs') return next(s, 'logs.done', { query: Q.containerLogs, variables: { id: ids[0], tail: Number(s.cfg?.logLines ?? 30) } });
			const op = s.action;
			return next({ ...s, container: s.names[0] }, 'action.done', { query: M.dockerAction(op), variables: { id: ids[0] } });
		}
		case 'action.done': {
			const c = d.docker?.[s.action];
			const verb = { restart: 'Restarted', start: 'Started', stop: 'Stopped' }[s.action];
			return done(s, `✅ ${verb} <b>${esc(nameOf(c))}</b> — ${esc(String(c.state).toLowerCase())} (${esc(c.status)})`);
		}
		case 'logs.done': {
			const logs = d.docker?.logs ?? { lines: [] };
			const name = s.names[0];
			const lines = R.filterLogLines(logs.lines.map((l) => ({ timestamp: l.timestamp, line: l.message })), { analyze: true, minSeverity: 'all' });
			const mark = { critical: '🔴', warning: '🟠', info: '🔵' };
			let body = lines.map((l) => `${l.severity ? mark[l.severity] + ' ' : ''}${l.line}`).join('\n');
			if (body.length > 3000) body = '…' + body.slice(-3000);
			const flagged = lines.filter((l) => l.severity === 'critical' || l.severity === 'warning');
			const steps = [...new Set(flagged.flatMap((l) => l.nextSteps ?? []))].slice(0, 3);
			return done(s, clip([
				`📜 <b>${esc(name)}</b> — last ${lines.length} line(s)${flagged.length ? `, ${flagged.length} flagged` : ''}`,
				`<pre>${esc(body) || '(empty)'}</pre>`,
				steps.length ? '<b>Next steps</b>\n' + steps.map((x, i) => `${i + 1}. ${esc(x)}`).join('\n') : '',
				`/restart_${cmd(name)}  /containers`,
			].filter(Boolean).join('\n\n')));
		}
		default:
			return done(s, `❌ Unknown stage ${esc(s.stage)}`);
	}
}

// ------------------------------------------------------------------------------------------------
// Alerts: polling with workflow static data (replaces the Unraid Trigger)
// ------------------------------------------------------------------------------------------------
const SYSLOG_QUERY = `query ($path: String!, $lines: Int, $startLine: Int) {
	info { os { hostname } }
	logFile(path: $path, lines: $lines, startLine: $startLine) { path content totalLines startLine }
}`;

function syslogRequest(cfg, store) {
	const path = cfg?.logPath || '/var/log/syslog';
	const last = store.syslogLast;
	if (last === undefined) return { query: SYSLOG_QUERY, variables: { path, lines: 1 } };
	return { query: SYSLOG_QUERY, variables: { path, lines: Number(cfg?.maxLines ?? 2000), startLine: last + 1 } };
}

/** API failures become one throttled alert instead of silence. */
function apiDownAlert(cfg, err) {
	return [{
		hostname: 'Unraid', source: 'api', severity: 'critical', key: 'api:unreachable', category: 'api',
		title: 'Unraid API not reachable', details: err,
		nextSteps: ['Check that the server is up and the WebGUI answers at cfg.unraidUrl.', 'Check the Unraid header credential (x-api-key) is still valid.'],
		cfg,
	}];
}

function syslogResult(cfg, store, res) {
	const err = apiError(res);
	if (err) return apiDownAlert(cfg, err);
	const f = res.data.logFile;
	const hostname = res.data.info?.os?.hostname;
	const last = store.syslogLast;
	if (last === undefined) {
		store.syslogLast = f.totalLines; // first run: baseline only
		return [];
	}
	if (f.totalLines < last) {
		store.syslogLast = 0; // rotated: read the new file from the top next time
		return [];
	}
	const raw = R.splitLogContent(f.content, f.startLine);
	store.syslogLast = Math.min(f.totalLines, (f.startLine ?? last + 1) + raw.length - 1);
	const minSeverity = cfg?.minSeverity || 'warning';
	const lines = R.filterLogLines(raw, { analyze: true, minSeverity });
	if (!lines.length) return [];
	const worst = lines.reduce((acc, l) => (l.severity && R.severityAtLeast(l.severity, acc) ? l.severity : acc), 'info');
	return [{
		hostname, source: 'logFile', path: f.path, severity: worst,
		categories: [...new Set(lines.map((l) => l.category).filter(Boolean))],
		count: lines.length, nextSteps: [...new Set(lines.flatMap((l) => l.nextSteps ?? []))], lines, cfg,
	}];
}

function healthResult(cfg, store, res) {
	const err = apiError(res);
	if (err) return apiDownAlert(cfg, err);
	const ignore = String(cfg?.ignoreContainers ?? '').split(',').map((x) => x.trim()).filter(Boolean);
	const minSeverity = cfg?.minSeverity || 'warning';
	const findings = R.analyzeHealth(res.data, { ignoreContainers: ignore }).filter((f) => R.severityAtLeast(f.severity, minSeverity));
	const previous = store.healthKeys;
	store.healthKeys = findings.map((f) => f.key);
	const known = new Set(previous ?? []); // first run reports existing problems once
	return findings.filter((f) => !known.has(f.key)).map((f) => ({ hostname: res.data.info?.os?.hostname, status: 'new', ...f, cfg }));
}

module.exports = { esc, cmd, apiError, matchContainer, parseCommand, sysPlan, sysStep, dockerPlan, dockerStep, syslogRequest, syslogResult, healthResult, PREFIXED, DOCKER, SYSLOG_QUERY }; // node-only
