// Runs the generated workflows in a small n8n-like executor: Code, Set, IF run for real, HTTP Request
// nodes answer from a mocked Unraid GraphQL API, and Telegram sends are recorded. No network access.
// Usage: node scripts/simulate.cjs [--quiet]   (exit code 1 when a scenario's expectation fails)
'use strict';
const path = require('node:path');
const root = path.join(__dirname, '..');
const load = (f) => require(path.join(root, 'workflows', `${f}.json`));
const wfs = { alerts: load('unraid-alerts'), docker: load('unraid-docker'), bot: load('unraid-sysadmin-bot') };
const quiet = process.argv.includes('--quiet');

// ---------------- mocked Unraid GraphQL API (fake data)
const S = 'srv';
const state = {
	containers: [
		{ id: `${S}:1`, names: ['/sonarr'], image: 'linuxserver/sonarr', state: 'EXITED', status: 'Exited (1) 3 minutes ago', autoStart: true, isUpdateAvailable: true },
		{ id: `${S}:2`, names: ['/Plex-Media-Server'], image: 'plexinc/pms-docker', state: 'RUNNING', status: 'Up 2 days', autoStart: true, isUpdateAvailable: true },
		{ id: `${S}:3`, names: ['/nextcloud'], image: 'nextcloud', state: 'RUNNING', status: 'Up 2 days', autoStart: true, isUpdateAvailable: true },
		{ id: `${S}:4`, names: ['/n8n'], image: 'n8nio/n8n', state: 'RUNNING', status: 'Up 1 day', autoStart: true, isUpdateAvailable: false },
	],
	syslog: ['Oct 24 10:00:00 Tower emhttpd: spinning down', 'Oct 24 10:01:00 Tower kernel: eth0: link up'],
	apiDown: false,
};
const disk = (o) => ({ id: `${S}:${o.name}`, idx: 1, device: 'sdc', status: 'DISK_OK', type: 'DATA', temp: 34, rotational: true, isSpinning: true, numErrors: 0, fsSize: 1000, fsUsed: 600, ...o });
const array = {
	id: `${S}:array`, state: 'STARTED',
	capacity: { kilobytes: { free: '10543755636', used: '13454522877', total: '23998278513' } },
	parityCheckStatus: { date: '2026-10-03T09:59:16.000Z', status: 'COMPLETED', errors: null },
	parities: [disk({ name: 'parity', device: 'sdb', type: 'PARITY', numErrors: 4, fsSize: null, fsUsed: null })],
	disks: [disk({ name: 'disk1' }), disk({ name: 'disk2', temp: null, isSpinning: false })],
	caches: [disk({ name: 'cache', device: 'nvme0n1', type: 'CACHE', rotational: false, temp: 50 })],
};
const copy = (x) => JSON.parse(JSON.stringify(x));
function graphql(query, v = {}) {
	if (state.apiDown) return { errors: [{ message: 'API key validation failed', extensions: { code: 'UNAUTHENTICATED' } }], data: null };
	const q = query.replace(/\s+/g, ' ');
	const cs = () => state.containers.map(copy);
	if (q.includes('updateContainers(ids')) return { data: { docker: { updateContainers: v.ids.map((id) => ({ ...copy(state.containers.find((c) => c.id === id)), state: 'RUNNING', isUpdateAvailable: false })) } } };
	const action = q.match(/docker \{ (restart|start|stop)\(id/);
	if (action) {
		const c = state.containers.find((x) => x.id === v.id);
		c.state = action[1] === 'stop' ? 'EXITED' : 'RUNNING';
		c.status = action[1] === 'stop' ? 'Exited (0) now' : 'Up 1 second';
		return { data: { docker: { [action[1]]: copy(c) } } };
	}
	if (q.includes('refreshDockerDigests')) return { data: { refreshDockerDigests: true } };
	if (q.includes('containerUpdateStatuses')) return { data: { docker: { containerUpdateStatuses: state.containers.map((c) => ({ name: c.names[0].slice(1), updateStatus: c.isUpdateAvailable ? 'UPDATE_AVAILABLE' : 'UP_TO_DATE' })) } } };
	if (q.includes('logs(id')) return { data: { docker: { logs: { containerId: v.id, cursor: 'x', lines: [{ timestamp: '2026-10-25T08:00:00Z', message: 'Starting' }, { timestamp: '2026-10-25T08:00:01Z', message: 'Fatal error: database disk image is malformed' }] } } } };
	if (q.includes('warningsAndAlerts') && q.includes('array')) return { data: { info: { os: { hostname: 'Tower', uptime: '2026-10-23T10:34:57.703Z' } }, array: copy(array), disks: [], docker: { containers: cs() }, notifications: { warningsAndAlerts: [] }, metrics: { cpu: { percentTotal: 4 }, memory: { percentTotal: 17 } } } };
	if (q.includes('docker { containers {')) return { data: { docker: { containers: cs() } } };
	if (q.includes('metrics {') && q.includes('info {')) return { data: { info: { os: { hostname: 'Tower', distro: 'Unraid OS', release: '7.3', uptime: '2026-10-23T10:34:57.703Z' }, cpu: { brand: 'Core i5', cores: 6, threads: 12 } }, metrics: { cpu: { percentTotal: 4.2 }, memory: { total: 33436139520, available: 27653578752, percentTotal: 17.3 } }, array: { state: 'STARTED', capacity: array.capacity } } };
	if (q.includes('parityHistory')) return { data: { parityHistory: [{ date: '2026-10-03T21:20:29.000Z', duration: 40873, status: 'COMPLETED', errors: 0 }] } };
	if (q.includes('parityCheck {')) return { data: { parityCheck: { start: {}, pause: {}, resume: {}, cancel: {} } } };
	if (q.includes('logFile(path')) {
		const total = state.syslog.length;
		const start = v.startLine ?? Math.max(1, total - v.lines + 1);
		const content = state.syslog.slice(start - 1, start - 1 + v.lines).map((l) => l + '\n').join('');
		return { data: { info: { os: { hostname: 'Tower' } }, logFile: { path: '/var/log/syslog', totalLines: total, startLine: start, content } } };
	}
	if (q.includes('array {')) return { data: { array: copy(array) } };
	if (q.includes('list(filter')) return { data: { notifications: { list: [{ id: `${S}:n1`, subject: 'Array health report [PASS]', description: 'Array has 5 disks', importance: 'INFO', formattedTimestamp: 'Sat 00:20' }] } } };
	if (q.includes('archiveAll')) return { data: { archiveAll: { unread: { total: 0 }, archive: { total: 7 } } } };
	if (q.includes('notifyIfUnique')) return { data: { notifyIfUnique: { id: 'n2' } } };
	if (q.includes('vms {')) return { data: { vms: { domains: [] } } };
	throw new Error('unmocked query ' + q.slice(0, 100));
}

// ---------------- executor
const evalExpr = (str, json, $) => {
	if (typeof str !== 'string' || !str.startsWith('=')) return str;
	const body = str.slice(1);
	const whole = body.match(/^\{\{([\s\S]*)\}\}$/);
	if (whole && !whole[1].includes('}}')) return new Function('$json', '$', `return (${whole[1]});`)(json, $);
	return body.replace(/\{\{([\s\S]*?)\}\}/g, (_, e) => String(new Function('$json', '$', `return (${e});`)(json, $)));
};
const setPath = (o, p, v) => { const ks = p.split('.'); let t = o; for (const k of ks.slice(0, -1)) t = t[k] ??= {}; t[ks.at(-1)] = v; };

async function run(wfKey, startName, startItems, opts = {}) {
	const wf = wfs[wfKey];
	const byName = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));
	const outputs = {}; const sent = []; const calls = [];
	const staticData = opts.staticData?.[wfKey] ?? {};
	const $ = (n) => ({ all: () => outputs[n] ?? [], first: () => (outputs[n] ?? [])[0], isExecuted: !!outputs[n] });
	const queue = [[startName, startItems]];
	while (queue.length) {
		const [name, items] = queue.shift();
		const n = byName[name];
		if (!n) throw new Error(`no node ${name}`);
		let outs;
		const t = n.type;
		if (n.disabled || /Trigger$|trigger$/.test(t)) outs = [items];
		else if (t === 'n8n-nodes-base.set') {
			outs = [items.map(({ json }) => { const o = copy(json); for (const a of n.parameters.assignments.assignments) setPath(o, a.name, opts.settings?.[a.name] ?? a.value); return { json: o }; })];
		} else if (t === 'n8n-nodes-base.code') {
			const fn = new Function('$input', '$', '$getWorkflowStaticData', `return (async () => { ${n.parameters.jsCode} })()`);
			outs = [(await fn({ all: () => items, first: () => items[0] }, $, () => staticData)) ?? []];
		} else if (t === 'n8n-nodes-base.if') {
			const yes = [], no = [];
			for (const it of items) (n.parameters.conditions.conditions.every((c) => evalExpr(c.leftValue, it.json, $) === true) ? yes : no).push(it);
			outs = [yes, no];
		} else if (t === 'n8n-nodes-base.httpRequest') {
			outs = [items.map((it) => {
				const url = evalExpr(n.parameters.url, it.json, $);
				const body = JSON.parse(evalExpr(n.parameters.jsonBody, it.json, $));
				calls.push({ node: name, url, query: body.query.replace(/\s+/g, ' ').slice(0, 50) });
				if (!/^https:\/\/tower\.local\/graphql$/.test(url)) throw new Error(`bad url ${url}`);
				return { json: graphql(body.query, body.variables) };
			})];
		} else if (t === 'n8n-nodes-base.telegram') {
			for (const it of items) sent.push({ node: name, chatId: evalExpr(n.parameters.chatId, it.json, $), text: evalExpr(n.parameters.text, it.json, $), menu: n.parameters.replyMarkup === 'replyKeyboard' });
			outs = [items];
		} else if (t === 'n8n-nodes-base.executeWorkflow') {
			const sub = await run('docker', 'From Telegram bot', items, opts);
			sent.push(...sub.sent.map((s) => ({ ...s, node: 'docker/' + s.node })));
			calls.push(...sub.calls);
			outs = [items];
		} else throw new Error('unsupported node type ' + t);
		outputs[name] = outs[0];
		(wf.connections[name]?.main ?? []).forEach((targets, i) => { if (outs[i]?.length) for (const x of targets) queue.push([x.node, outs[i]]); });
	}
	if (opts.staticData) opts.staticData[wfKey] = staticData;
	return { sent, calls };
}

// ---------------- scenarios
const ME = '111';
const settings = { 'cfg.allowedChatIds': ME, 'cfg.telegramChatId': ME, 'cfg.unraidUrl': 'https://tower.local/' };
const msg = (text, chat = ME) => [{ json: { message: { chat: { id: Number(chat) }, from: { username: 'me' }, text } } }];
let failures = 0;
async function scenario(label, promise, expect) {
	const r = await promise;
	const all = r.sent.map((s) => s.text).join('\n---\n');
	const ok = expect(r, all);
	if (!ok) failures++;
	if (!quiet || !ok) {
		console.log(`\n${ok ? 'PASS' : 'FAIL'} ${label}  [${r.calls.length} API call(s)]`);
		for (const s of r.sent) console.log(`-> ${s.node} chat=${s.chatId}${s.menu ? ' +menu' : ''}\n${s.text}`);
		if (!r.sent.length) console.log('(no Telegram message)');
	} else console.log(`PASS ${label}`);
}
const has = (re) => (r, all) => re.test(all);

(async () => {
	const bot = (t, s = settings) => run('bot', 'Telegram', msg(t), { settings: s });
	await scenario('stranger, bot not configured', run('bot', 'Telegram', msg('/status', '999'), { settings: { ...settings, 'cfg.allowedChatIds': '' } }), has(/Your chat ID is <code>999<\/code>/));
	await scenario('stranger, bot configured', run('bot', 'Telegram', msg('/status', '999'), { settings }), (r) => r.sent.length === 0 && r.calls.length === 0);
	await scenario('/start shows menu', bot('/start'), (r) => r.sent[0]?.menu && /Unraid bot/.test(r.sent[0].text));
	await scenario('/status', bot('/status'), has(/Container sonarr is exited.*\/start_sonarr[\s\S]*parity has 4/));
	await scenario('/info', bot('/info'), has(/RAM 17% of 31\.1 GB[\s\S]*Array started — 12\.53 \/ 22\.35 TB/));
	await scenario('/disks', bot('/disks'), has(/parity.*4 errors[\s\S]*cache.*50°C/));
	await scenario('/parity', bot('/parity'), has(/2026-10-03 — completed/));
	await scenario('/parity_start asks first', bot('/parity_start'), (r, all) => /parity_start_confirm/.test(all) && r.calls.length === 0);
	await scenario('/parity_start_confirm', bot('/parity_start_confirm'), has(/start sent/));
	state.syslog.push('Oct 24 12:24:52 Tower kernel: ata5.00: error: { UNC }', 'Oct 24 13:00:00 Tower sshd[1]: Failed password for root from 10.0.0.5');
	await scenario('/syslog', bot('/syslog'), has(/2 warning\/critical[\s\S]*disk: 1 · security: 1/));
	await scenario('/notifications', bot('/notifications'), has(/1 unread/));
	await scenario('/archive_all', bot('/archive_all'), has(/Archived/));
	await scenario('/vms', bot('/vms'), has(/No virtual machines/));
	await scenario('/bogus -> help', bot('/bogus'), (r) => r.sent[0]?.menu && /Unknown command/.test(r.sent[0].text));
	await scenario('/containers', bot('/containers'), has(/4 containers.*3 running[\s\S]*\/logs_plex_media_server/));
	await scenario('/updates', bot('/updates'), has(/3 update\(s\)[\s\S]*\/update_plex_media_server/));
	await scenario('/logs_sonarr', bot('/logs_sonarr'), has(/🟠 Fatal error[\s\S]*Next steps/));
	await scenario('/restart_plex_media_server', bot('/restart_plex_media_server'), has(/Restarted <b>Plex-Media-Server<\/b>/));
	await scenario('/stop_sonarr asks first', bot('/stop_sonarr'), (r, all) => /stop_sonarr_confirm/.test(all) && r.calls.length === 0);
	await scenario('/stop_sonarr_confirm', bot('/stop_sonarr_confirm'), has(/Stopped <b>sonarr<\/b>/));
	await scenario('/start_sonarr', bot('/start_sonarr'), has(/Started <b>sonarr<\/b>/));
	await scenario('/update_sonarr', bot('/update_sonarr'), has(/Updated 1 container[\s\S]*sonarr/));
	await scenario('/update_all asks first', bot('/update_all'), has(/update_all_confirm/));
	await scenario('/update_all_confirm', bot('/update_all_confirm'), (r, all) => /Updated 2 container[\s\S]*Plex-Media-Server[\s\S]*Skipped \(excluded\): nextcloud/.test(all) && r.calls.length === 3);
	await scenario('/restart_unknown', bot('/restart_unknown'), has(/no container with that name/));
	state.apiDown = true;
	await scenario('/status with revoked key', bot('/status'), has(/invalid or was revoked/));
	state.apiDown = false;

	// docker weekly window
	state.containers.forEach((c) => (c.isUpdateAvailable = c.names[0] === '/nextcloud'));
	await scenario('weekly: only excluded has update -> silent', run('docker', 'Weekly update window', [{ json: {} }], { settings }), (r) => r.sent.length === 0);
	state.containers[0].isUpdateAvailable = true;
	await scenario('weekly: sonarr has update', run('docker', 'Weekly update window', [{ json: {} }], { settings }), has(/Updated 1 container\(s\)<\/b> \(weekly window\)[\s\S]*sonarr/));

	// alerts (static data persists between runs like in production)
	const sd = {};
	const alertSettings = { ...settings, 'cfg.autoRestartContainers': true };
	const minute = () => run('alerts', 'Every minute', [{ json: {} }], { settings: alertSettings, staticData: sd });
	const five = () => run('alerts', 'Every 5 minutes', [{ json: {} }], { settings: alertSettings, staticData: sd });
	await scenario('syslog: first run is baseline only', minute(), (r) => r.sent.length === 0);
	await scenario('syslog: nothing new', minute(), (r) => r.sent.length === 0);
	state.syslog.push('Oct 25 09:00:00 Tower kernel: critical medium error, dev sdb, sector 1', 'Oct 25 09:00:01 Tower kernel: md: disk0 read error, sector=1');
	await scenario('syslog: new disk errors alert', minute(), has(/CRITICAL.*Tower[\s\S]*2 critical line\(s\)[\s\S]*Next steps[\s\S]*\/disks/));
	state.syslog.push('Oct 25 09:05:00 Tower kernel: critical medium error, dev sdb, sector 2');
	await scenario('syslog: same category again is throttled', minute(), (r) => r.sent.length === 0);
	state.syslog = ['Oct 25 10:00:00 Tower rsyslogd: restart'];
	await scenario('syslog: rotation resets quietly', minute(), (r) => r.sent.length === 0);
	state.containers[0].state = 'EXITED';
	await scenario('health: existing problems once + auto-restart', five(), (r, all) => /Container sonarr is exited[\s\S]*parity has 4/.test(all) && /Auto-restarted <b>sonarr<\/b>/.test(all));
	await scenario('health: no new problems', five(), (r) => r.sent.length === 0);
	state.apiDown = true;
	await scenario('health: API down raises one alert', five(), has(/Unraid API not reachable/));
	await scenario('health: API down again is throttled', five(), (r) => r.sent.length === 0);
	state.apiDown = false;

	console.log(`\n${failures ? `${failures} scenario(s) FAILED` : 'all scenarios passed'}`);
	process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('SIMULATION ERROR', e); process.exit(1); });
