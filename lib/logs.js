// Vendored from @silentjma/n8n-nodes-unraid v0.1.0 (dist/lib/logs.js). Update with: npm run sync-rules
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.splitLogContent = splitLogContent;
exports.compilePattern = compilePattern;
exports.filterLogLines = filterLogLines;
// Log text -> structured lines, optionally filtered by regex and classified with suggested next steps.
const analysis_1 = require("./analysis");
function splitLogContent(content, startLine) {
    const raw = content.split(/\r?\n/);
    if (raw.length && raw[raw.length - 1] === '')
        raw.pop();
    return raw.map((line, i) => ({ lineNumber: startLine ? startLine + i : undefined, line }));
}
function compilePattern(pattern) {
    if (!pattern?.trim())
        return undefined;
    try {
        return new RegExp(pattern, 'i');
    }
    catch (error) {
        throw new Error(`Invalid filter pattern "${pattern}": ${error.message}`);
    }
}
function filterLogLines(lines, filter) {
    const regex = compilePattern(filter.pattern);
    const out = [];
    for (const l of lines) {
        if (regex && !regex.test(l.line))
            continue;
        if (filter.analyze) {
            const match = (0, analysis_1.classifyLogLine)(l.line);
            if (filter.minSeverity && filter.minSeverity !== 'all' && (!match || !(0, analysis_1.severityAtLeast)(match.severity, filter.minSeverity)))
                continue;
            out.push(match ? { ...l, ...match } : l);
        }
        else {
            out.push(l);
        }
    }
    return out;
}
