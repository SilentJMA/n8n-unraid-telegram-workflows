'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine');

const cfg = { allowedChatIds: '42', unraidUrl: 'https://tower.local', excludeFromUpdates: 'n8n, mariadb' };
const parse = (text, chat = 42) => E.parseCommand({ message: { chat: { id: chat }, text }, cfg });

test('parses prefixed commands, confirmations and bot mentions', () => {
	const p = parse('/restart_plex_media_server');
	assert.deepEqual({ command: p.command, arg: p.arg, confirmed: p.confirmed, group: p.group }, { command: 'restart', arg: 'plex_media_server', confirmed: false, group: 'docker' });
	assert.equal(parse('/update_all_confirm').confirmed, true);
	assert.equal(parse('/update_all_confirm').arg, 'all');
	assert.equal(parse('/status@MyUnraidBot').command, 'status');
	assert.equal(parse('/start').command, 'help');
	assert.equal(parse('/start_sonarr').command, 'start');
	assert.equal(parse('hello').command, 'help');
	assert.equal(parse('/parity_start').group, 'parity');
});

test('authorizes only allowed chats', () => {
	assert.equal(parse('/status').authorized, true);
	assert.equal(parse('/status', 7).authorized, false);
	assert.equal(parse('/status', 7).configured, true);
});

test('matches containers by name, id and command-safe name', () => {
	const list = [{ id: 's:1', names: ['/Plex-Media-Server'] }, { id: 's:2', names: ['/sonarr'] }];
	assert.equal(E.matchContainer(list, 'plex_media_server').id, 's:1');
	assert.equal(E.matchContainer(list, 'Sonarr').id, 's:2');
	assert.equal(E.matchContainer(list, '2').id, 's:2');
	assert.equal(E.matchContainer(list, 'radarr'), undefined);
});

test('reports GraphQL errors with a hint', () => {
	assert.match(E.apiError({ errors: [{ message: 'API key validation failed', extensions: { code: 'UNAUTHENTICATED' } }] }), /revoked/);
	assert.match(E.apiError({ error: { message: 'connect ECONNREFUSED' } }), /ECONNREFUSED/);
	assert.equal(E.apiError({ data: { online: true } }), null);
});

test('update all excludes configured containers and asks for confirmation', () => {
	const ask = E.dockerPlan({ command: 'update', arg: 'all', confirmed: false, cfg });
	assert.equal(ask.request, null);
	assert.match(ask.text, /update_all_confirm/);
	let s = E.dockerPlan({ command: 'update', arg: 'all', confirmed: true, cfg, chatId: '42' });
	s = E.dockerStep(s, { data: { refreshDockerDigests: true } });
	s = E.dockerStep(s, {
		data: {
			docker: {
				containers: [
					{ id: 'a', names: ['/n8n'], isUpdateAvailable: true },
					{ id: 'b', names: ['/sonarr'], isUpdateAvailable: true },
					{ id: 'c', names: ['/radarr'], isUpdateAvailable: false },
				],
			},
		},
	});
	assert.deepEqual(s.request.variables, { ids: ['b'] });
	assert.deepEqual(s.skipped, ['n8n']);
});

test('weekly run stays silent when nothing needs an update', () => {
	let s = E.dockerPlan({ cfg });
	s = E.dockerStep(s, { data: { refreshDockerDigests: true } });
	s = E.dockerStep(s, { data: { docker: { containers: [{ id: 'a', names: ['/n8n'], isUpdateAvailable: true }] } } });
	assert.equal(s.silent, true);
});

test('syslog polling: baseline, new lines, rotation', () => {
	const store = {};
	const res = (total, start, lines) => ({ data: { info: { os: { hostname: 'Tower' } }, logFile: { path: '/var/log/syslog', totalLines: total, startLine: start, content: lines.join('\n') + '\n' } } });
	assert.deepEqual(E.syslogRequest(cfg, store).variables, { path: '/var/log/syslog', lines: 1 });
	assert.deepEqual(E.syslogResult(cfg, store, res(10, 10, ['x'])), []);
	assert.equal(store.syslogLast, 10);
	assert.equal(E.syslogRequest(cfg, store).variables.startLine, 11);
	const out = E.syslogResult(cfg, store, res(12, 11, ['kernel: I/O error, dev sdb', 'ok']));
	assert.equal(out.length, 1);
	assert.equal(out[0].severity, 'critical');
	assert.equal(store.syslogLast, 12);
	assert.deepEqual(E.syslogResult(cfg, store, res(3, 13, [])), []);
	assert.equal(store.syslogLast, 0);
});

test('health polling reports each problem once', () => {
	const store = {};
	const snap = { data: { info: { os: { hostname: 'Tower' } }, array: { state: 'STOPPED' } } };
	assert.equal(E.healthResult(cfg, store, snap).length, 1);
	assert.equal(E.healthResult(cfg, store, snap).length, 0);
	assert.equal(E.healthResult(cfg, store, { errors: [{ message: 'down' }] })[0].key, 'api:unreachable');
});
