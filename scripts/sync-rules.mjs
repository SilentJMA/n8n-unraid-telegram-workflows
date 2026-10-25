// Copies the compiled rules and queries from a checkout of @silentjma/n8n-nodes-unraid into lib/.
// Usage: npm run sync-rules -- <path to n8n-nodes-unraid checkout> (build that package first).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(process.argv[2] ?? join(root, '..', 'n8n-nodes-unraid'));
const pkg = JSON.parse(readFileSync(join(src, 'package.json'), 'utf8'));
for (const f of ['analysis', 'logs', 'queries']) {
	const body = readFileSync(join(src, 'dist', 'lib', `${f}.js`), 'utf8');
	writeFileSync(join(root, 'lib', `${f}.js`), `// Vendored from ${pkg.name} v${pkg.version} (dist/lib/${f}.js). Update with: npm run sync-rules\n${body}`);
	console.log(`lib/${f}.js <- ${pkg.name}@${pkg.version}`);
}
