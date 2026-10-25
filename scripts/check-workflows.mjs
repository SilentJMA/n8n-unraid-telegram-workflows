// Structural checks for the generated workflows: valid connections, unique names, references to
// existing nodes in $("..."), Code nodes that parse, no require(), and no community-node types.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let problems = 0;
const fail = (f, msg) => {
	problems++;
	console.error(`${f}: ${msg}`);
};
for (const file of ['unraid-alerts', 'unraid-docker', 'unraid-sysadmin-bot']) {
	const wf = JSON.parse(readFileSync(join(root, 'workflows', `${file}.json`), 'utf8'));
	const names = new Set(wf.nodes.map((n) => n.name));
	if (names.size !== wf.nodes.length) fail(file, 'duplicate node names');
	for (const n of wf.nodes) {
		if (!/^(n8n-nodes-base|@n8n\/n8n-nodes-langchain)\./.test(n.type)) fail(file, `${n.name} uses non-built-in type ${n.type}`);
		const text = JSON.stringify(n.parameters);
		for (const [, ref] of text.matchAll(/\$\(\\?['"]([^'"\\]+)\\?['"]\)/g)) {
			if (!names.has(ref)) fail(file, `${n.name} references missing node "${ref}"`);
		}
		if (n.type === 'n8n-nodes-base.code') {
			try {
				new Function('$input', '$', '$getWorkflowStaticData', `return (async () => { ${n.parameters.jsCode} })()`);
			} catch (e) {
				fail(file, `${n.name} does not parse: ${e.message}`);
			}
			if (/\brequire\s*\(/.test(n.parameters.jsCode)) fail(file, `${n.name} calls require()`);
		}
	}
	for (const [from, byType] of Object.entries(wf.connections)) {
		if (!names.has(from)) fail(file, `connection from missing node ${from}`);
		for (const outs of Object.values(byType)) for (const out of outs) for (const c of out) if (!names.has(c.node)) fail(file, `connection to missing node ${c.node}`);
	}
	const telegramTriggers = wf.nodes.filter((n) => n.type === 'n8n-nodes-base.telegramTrigger').length;
	if (telegramTriggers !== (file === 'unraid-sysadmin-bot' ? 1 : 0)) fail(file, `has ${telegramTriggers} Telegram Trigger(s)`);
	console.log(`checked ${file}: ${wf.nodes.length} nodes`);
}
if (problems) {
	console.error(`${problems} problem(s)`);
	process.exit(1);
}
