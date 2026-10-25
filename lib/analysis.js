// Vendored from @silentjma/n8n-nodes-unraid v0.1.0 (dist/lib/analysis.js). Update with: npm run sync-rules
"use strict";
// Pure analysis helpers: turn Unraid API snapshots and log lines into findings with suggested next steps.
// No n8n imports so the rules can be unit-tested and reused by both nodes.
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_HEALTH_OPTIONS = exports.LOG_RULE_NAMES = void 0;
exports.severityAtLeast = severityAtLeast;
exports.sortFindings = sortFindings;
exports.containerName = containerName;
exports.classifyLogLine = classifyLogLine;
exports.analyzeHealth = analyzeHealth;
exports.summarizeFindings = summarizeFindings;
const SEVERITY_RANK = { info: 0, warning: 1, critical: 2 };
function severityAtLeast(severity, minimum) {
    return SEVERITY_RANK[severity] >= SEVERITY_RANK[minimum];
}
function sortFindings(findings) {
    return [...findings].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.key.localeCompare(b.key));
}
/** Docker names come back as ["/plex"]; the first one without the slash is what the WebGUI shows. */
function containerName(container) {
    const first = container.names?.find((n) => n) ?? container.id ?? '';
    return first.replace(/^\//, '');
}
const num = (value) => {
    if (value === null || value === undefined || value === '')
        return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
};
const pct = (used, total) => {
    const u = num(used);
    const t = num(total);
    return u !== undefined && t ? Math.round((u / t) * 1000) / 10 : undefined;
};
const LOG_RULES = [
    {
        rule: 'disk-io-error',
        pattern: /\b(I\/O error|blk_update_request|critical medium error|Buffer I\/O error|md: disk\d+ (read|write) error|ata\d+(\.\d+)?: .*(failed command|exception|hard resetting link|link is slow|SError)|UNC\b|end_request)/i,
        severity: 'critical',
        category: 'disk',
        nextSteps: [
            'Identify the disk from the ataX / sdX / diskN in the line (Tools › System Devices or Main tab).',
            'Run a SMART extended test on that disk and check reallocated / pending sector counts.',
            'Reseat or replace the SATA/SAS cable and power cable; link resets are usually cabling.',
            'If the disk is disabled in the array, do not write to it; rebuild from parity once the cause is fixed.',
        ],
    },
    {
        rule: 'filesystem-corruption',
        pattern: /\b(BTRFS (error|critical|warning)|XFS \(.*\): (Corruption|Metadata|Internal error|log I\/O error)|EXT4-fs error|ZFS.*(error|faulted|degraded)|checksum error|csum failed|parent transid verify failed)/i,
        severity: 'critical',
        category: 'filesystem',
        nextSteps: [
            'Note the affected device (e.g. md1p1, nvme0n1p1) and stop writing to it.',
            'Start the array in maintenance mode and run a filesystem check (Main › disk › Check Filesystem Status).',
            'For BTRFS pools run a scrub; for ZFS run "zpool status -v" and a scrub.',
            'Run memtest if checksum errors keep appearing on several devices (bad RAM causes them).',
        ],
    },
    {
        rule: 'out-of-memory',
        pattern: /\b(Out of memory|oom-kill|oom_reaper|invoked oom-killer|Killed process \d+)/i,
        severity: 'critical',
        category: 'memory',
        nextSteps: [
            'Find the killed process / container in the line and set a memory limit on it (--memory=… in Extra Parameters).',
            'Check for containers writing to RAM (paths mapped to /tmp or not to /mnt/user) filling the rootfs.',
            'Review VM memory allocations against total RAM.',
        ],
    },
    {
        rule: 'hardware-mce',
        pattern: /\b(Machine check|mce: \[Hardware Error\]|Hardware Error|EDAC .*(error|CE|UE)|PCIe Bus Error|AER: (Corrected|Uncorrected))/i,
        severity: 'critical',
        category: 'hardware',
        nextSteps: [
            'Install mcelog (NerdTools / Nerd Pack) to decode the machine check, or check the BIOS event log.',
            'Run memtest86 for at least one full pass.',
            'Update the BIOS and check CPU / VRM temperatures and PSU health.',
        ],
    },
    {
        rule: 'kernel-trace',
        pattern: /\b(Call Trace|kernel BUG|general protection fault|Kernel panic|BUG: unable to handle|watchdog: BUG: soft lockup|rcu_sched self-detected stall|macvlan.*(call trace|broadcast))/i,
        severity: 'critical',
        category: 'kernel',
        nextSteps: [
            'Download diagnostics (Tools › Diagnostics) while the trace is still in the syslog.',
            'If the trace mentions macvlan, switch Docker custom networks to ipvlan (Settings › Docker).',
            'Check that Unraid and plugins are up to date; post the diagnostics on the Unraid forum if it repeats.',
        ],
    },
    {
        rule: 'disk-space',
        pattern: /\b(No space left on device|disk quota exceeded|cache.*(full|is full)|docker\.img.*(full|100%)|ENOSPC)/i,
        severity: 'critical',
        category: 'storage',
        nextSteps: [
            'Check docker.img / cache / array usage on the Main tab.',
            'Run the Mover if the cache is full, and set a minimum free space on shares.',
            'Find containers writing inside docker.img (Docker › Container Size) and map their paths to appdata.',
        ],
    },
    {
        rule: 'parity-errors',
        pattern: /\b(parity (check|sync).*(error|incorrect)|sync errors?|Parity.*finished.*\d+ errors)/i,
        severity: 'warning',
        category: 'parity',
        nextSteps: [
            'If this follows an unclean shutdown, run a correcting parity check.',
            'If errors repeat on consecutive checks, run memtest and check disk SMART data.',
        ],
    },
    {
        rule: 'auth-failure',
        pattern: /\b(authentication failure|Failed password|Invalid user|Failed login|webGUI: Unsuccessful login|refused connect|Bad protocol version)/i,
        severity: 'warning',
        category: 'security',
        nextSteps: [
            'Check the source IP: if it is not on your LAN, the server is exposed to the internet.',
            'Disable port forwarding for SSH / WebGUI; use WireGuard, Tailscale or Unraid Connect remote access instead.',
            'Set a strong root password and consider disabling SSH password login.',
        ],
    },
    {
        rule: 'segfault',
        pattern: /\b(segfault at|traps: .* (general protection|trap divide error)|core dumped)/i,
        severity: 'warning',
        category: 'application',
        nextSteps: [
            'Identify the process; if it belongs to a container, restart it and check for an image update.',
            'Repeated segfaults across processes can point to bad RAM; run memtest.',
        ],
    },
    {
        rule: 'docker-error',
        pattern: /\b(dockerd|containerd|docker)\b.*\b(error|failed|cannot|unable)\b/i,
        severity: 'warning',
        category: 'docker',
        nextSteps: [
            'Check the named container\'s own log (Docker › container › Logs) for the root cause.',
            'Restart the container; if Docker itself fails, check that docker.img is not full or corrupted.',
        ],
    },
    {
        rule: 'network',
        pattern: /\b(Link is Down|NIC Link is Down|link down|carrier lost|bond\d+: .*(link status definitely down|No active)|duplicate address detected|DHCP.*(failed|timeout))/i,
        severity: 'warning',
        category: 'network',
        nextSteps: [
            'Check the network cable, switch port and NIC; note which interface went down.',
            'If it flaps, check for duplicate IPs and bonding / bridging settings (Settings › Network).',
        ],
    },
    {
        rule: 'temperature',
        pattern: /\b(temperature above threshold|cpu clock throttled|Package temperature|overheat|thermal)\b/i,
        severity: 'warning',
        category: 'temperature',
        nextSteps: [
            'Check fans, airflow and dust; confirm CPU cooler mounting.',
            'Review fan curves (Dynamix Auto Fan Control) and disk temperature thresholds.',
        ],
    },
    {
        rule: 'app-fatal',
        pattern: /\b(fatal( error)?:|panic:|unhandled exception|uncaught exception|traceback \(most recent call last\)|database disk image is malformed|database is locked|corrupt(ed|ion)\b)/i,
        severity: 'warning',
        category: 'application',
        nextSteps: [
            'Read the lines before this one in the container log for the root cause.',
            'For database corruption: stop the container, back up its appdata, then repair or restore the database.',
            'Check the appdata path is on a healthy disk / pool and not full.',
        ],
    },
    {
        rule: 'generic-error',
        pattern: /\b(error|failed|failure|fatal|critical|panic|denied)\b/i,
        severity: 'info',
        category: 'general',
        nextSteps: ['Look at the surrounding log lines for context; repeated occurrences deserve a closer look.'],
    },
];
const BENIGN = [
    /ACPI (Error|Warning|BIOS Error).*(AE_NOT_FOUND|AE_ALREADY_EXISTS)/i, // Common BIOS table noise.
    /\bcorrected error\b.*\bPCIe\b.*\bReceiver Error\b/i,
    /\b(error|failed)=0\b/i,
];
function classifyLogLine(line) {
    if (!line.trim() || BENIGN.some((p) => p.test(line)))
        return null;
    for (const r of LOG_RULES) {
        if (r.pattern.test(line))
            return { severity: r.severity, category: r.category, rule: r.rule, nextSteps: r.nextSteps };
    }
    return null;
}
exports.LOG_RULE_NAMES = LOG_RULES.map((r) => r.rule);
exports.DEFAULT_HEALTH_OPTIONS = {
    diskUsageWarningPercent: 90,
    diskUsageCriticalPercent: 97,
    defaultTempWarning: 45,
    defaultTempCritical: 55,
    defaultSsdTempWarning: 60,
    defaultSsdTempCritical: 70,
    memoryWarningPercent: 90,
    cpuWarningPercent: 95,
    reportStoppedAutostartContainers: true,
    reportContainerUpdates: true,
    includeUnraidNotifications: true,
    ignoreContainers: [],
};
const diskLabel = (d) => d.name || d.device || d.id;
function analyzeHealth(snapshot, options = {}) {
    const o = { ...exports.DEFAULT_HEALTH_OPTIONS, ...options };
    const findings = [];
    const array = snapshot.array;
    if (array?.state && array.state !== 'STARTED') {
        findings.push({
            key: `array:state:${array.state}`,
            severity: 'critical',
            category: 'array',
            title: `Array is ${array.state}`,
            details: `The Unraid array is in state ${array.state}; shares, Docker and VMs on the array are unavailable.`,
            nextSteps: array.state === 'STOPPED'
                ? ['If this was not intentional, check the Main tab for missing disks before starting the array.', 'Start the array once all disks are present.']
                : ['Open the Main tab: the state names the problem (missing / wrong / too small disk).', 'Do not start the array or format anything until the disk assignment is correct.'],
            suggestedAction: array.state === 'STOPPED' ? { resource: 'array', operation: 'start' } : undefined,
        });
    }
    const arrayDisks = [...(array?.parities ?? []), ...(array?.disks ?? []), ...(array?.caches ?? [])];
    for (const d of arrayDisks) {
        const label = diskLabel(d);
        if (d.status && !['DISK_OK', 'DISK_NP'].includes(d.status)) {
            findings.push({
                key: `disk:status:${d.id}:${d.status}`,
                severity: 'critical',
                category: 'disk',
                title: `${label} is ${d.status.replace(/^DISK_/, '').toLowerCase()}`,
                details: `${d.type ?? 'Disk'} ${label} (${d.device ?? 'no device'}) reports status ${d.status}.`,
                nextSteps: d.status.includes('DSBL') || d.status === 'DISK_INVALID'
                    ? [
                        'The disk is disabled (red X) and is being emulated from parity. Do not write heavily to the array.',
                        'Check SMART data and cabling, then download diagnostics before changing anything.',
                        'Rebuild onto the same disk (if healthy) or a replacement: stop array, unassign, start, stop, reassign, start.',
                    ]
                    : ['Check the Main tab for the disk assignment and whether the disk is physically connected.', 'Download diagnostics before reassigning disks.'],
            });
        }
        const errors = num(d.numErrors);
        if (errors && errors > 0) {
            findings.push({
                key: `disk:errors:${d.id}`,
                severity: 'warning',
                category: 'disk',
                title: `${label} has ${errors} read/write error(s)`,
                details: `The array driver recorded ${errors} unrecoverable I/O errors on ${label} since the counters were last cleared.`,
                nextSteps: ['Run a SMART extended test on the disk.', 'Check / replace the SATA and power cables.', 'Clear the statistics after fixing so new errors stand out.'],
            });
        }
        if (d.temp !== null && d.temp !== undefined) {
            const ssd = d.rotational === false;
            const crit = d.critical ?? (ssd ? o.defaultSsdTempCritical : o.defaultTempCritical);
            const warn = d.warning ?? (ssd ? o.defaultSsdTempWarning : o.defaultTempWarning);
            const level = d.temp >= crit ? 'critical' : d.temp >= warn ? 'warning' : null;
            if (level) {
                findings.push({
                    key: `disk:temp:${d.id}:${level}`,
                    severity: level,
                    category: 'temperature',
                    title: `${label} is at ${d.temp}°C`,
                    details: `${label} temperature ${d.temp}°C exceeds the ${level} threshold (${level === 'critical' ? crit : warn}°C).`,
                    nextSteps: ['Check case fans and airflow over the drive cage.', 'Pause a running parity check if it is driving the temperature up.', 'Review fan control and per-disk thresholds (Settings › Disk Settings).'],
                });
            }
        }
        const usage = pct(d.fsUsed, d.fsSize);
        if (usage !== undefined && usage >= o.diskUsageWarningPercent) {
            const level = usage >= o.diskUsageCriticalPercent ? 'critical' : 'warning';
            findings.push({
                key: `disk:usage:${d.id}:${level}`,
                severity: level,
                category: 'storage',
                title: `${label} is ${usage}% full`,
                details: `Filesystem on ${label} is ${usage}% used.`,
                nextSteps: d.type === 'CACHE'
                    ? ['Run the Mover (Main › Move) and check share cache settings.', 'Set a minimum free space on the pool so writes overflow to the array.']
                    : ['Set a minimum free space on shares and check the split level / allocation method.', 'Plan a new or larger disk if all data disks are filling up.'],
            });
        }
    }
    const parity = array?.parityCheckStatus;
    if (parity?.status === 'FAILED') {
        findings.push({
            key: 'parity:failed',
            severity: 'critical',
            category: 'parity',
            title: 'Last parity check failed',
            details: 'The most recent parity check did not finish successfully.',
            nextSteps: ['Check the syslog around the end of the check for disk errors.', 'Run the check again once disk issues are fixed.'],
        });
    }
    else if (parity && (parity.errors ?? 0) > 0 && !parity.running) {
        findings.push({
            key: `parity:errors:${parity.errors}`,
            severity: 'warning',
            category: 'parity',
            title: `Parity check found ${parity.errors} error(s)`,
            details: `The last parity check (${parity.status}) reported ${parity.errors} sync errors.`,
            nextSteps: ['After an unclean shutdown, run a correcting check once.', 'If errors return on the next non-correcting check, run memtest and inspect SMART data.'],
        });
    }
    for (const d of snapshot.disks ?? []) {
        if (d.smartStatus && d.smartStatus !== 'OK' && d.smartStatus !== 'UNKNOWN') {
            findings.push({
                key: `smart:${d.id}:${d.smartStatus}`,
                severity: 'critical',
                category: 'disk',
                title: `SMART status of ${d.name || d.device} is ${d.smartStatus}`,
                details: `Physical disk ${d.device} reports SMART status ${d.smartStatus}.`,
                nextSteps: ['Back up anything on this disk that is not protected by parity.', 'Order a replacement and run an extended SMART test to confirm.'],
            });
        }
    }
    const ignored = new Set(o.ignoreContainers.map((n) => n.trim().toLowerCase()).filter(Boolean));
    for (const c of snapshot.docker?.containers ?? []) {
        const name = containerName(c);
        if (ignored.has(name.toLowerCase()))
            continue;
        if (o.reportStoppedAutostartContainers && c.autoStart && c.state && c.state !== 'RUNNING') {
            findings.push({
                key: `container:down:${name}`,
                severity: 'warning',
                category: 'docker',
                title: `Container ${name} is ${c.state.toLowerCase()}`,
                details: `${name} (${c.image}) has autostart enabled but is ${c.state} — ${c.status ?? ''}`.trim(),
                nextSteps: [
                    `Read the last log lines of ${name} for the exit reason.`,
                    `Restart ${name}; if it exits again, check its appdata paths and recent image changes.`,
                ],
                suggestedAction: { resource: 'dockerContainer', operation: c.state === 'PAUSED' ? 'unpause' : 'start', id: c.id, name },
            });
        }
        if (o.reportContainerUpdates && c.isUpdateAvailable) {
            findings.push({
                key: `container:update:${name}`,
                severity: 'info',
                category: 'docker-update',
                title: `Update available for ${name}`,
                details: `A newer image is available for ${name} (${c.image}).`,
                nextSteps: [`Read the release notes of ${c.image} for breaking changes.`, `Update ${name} (back up its appdata first for databases).`],
                suggestedAction: { resource: 'dockerContainer', operation: 'update', id: c.id, name },
            });
        }
    }
    if (o.includeUnraidNotifications) {
        for (const n of snapshot.notifications?.warningsAndAlerts ?? []) {
            findings.push({
                key: `notification:${n.id}`,
                severity: n.importance === 'ALERT' ? 'critical' : 'warning',
                category: 'unraid-notification',
                title: n.subject || n.title || 'Unraid notification',
                details: [n.title, n.description].filter(Boolean).join(' — '),
                nextSteps: ['Open the notification in the Unraid WebGUI and archive it once handled.'],
            });
        }
    }
    const mem = snapshot.metrics?.memory?.percentTotal;
    if (mem !== undefined && mem >= o.memoryWarningPercent) {
        findings.push({
            key: 'memory:high',
            severity: 'warning',
            category: 'memory',
            title: `Memory usage at ${Math.round(mem)}%`,
            details: `RAM usage is ${Math.round(mem)}% (swap ${Math.round(snapshot.metrics?.memory?.percentSwapTotal ?? 0)}%).`,
            nextSteps: ['Find the heaviest containers (Docker › Advanced view / ctop).', 'Set memory limits on containers and check VM allocations.'],
        });
    }
    const cpu = snapshot.metrics?.cpu?.percentTotal;
    if (cpu !== undefined && cpu >= o.cpuWarningPercent) {
        findings.push({
            key: 'cpu:high',
            severity: 'info',
            category: 'cpu',
            title: `CPU usage at ${Math.round(cpu)}%`,
            details: `Total CPU usage is ${Math.round(cpu)}% at the time of the check.`,
            nextSteps: ['Check whether a parity check, mover, transcode or backup is running.', 'Pin heavy containers / VMs to specific cores if this is persistent.'],
        });
    }
    return sortFindings(findings);
}
function summarizeFindings(findings) {
    const counts = { critical: 0, warning: 0, info: 0 };
    for (const f of findings)
        counts[f.severity]++;
    const status = counts.critical ? 'critical' : counts.warning ? 'warning' : counts.info ? 'info' : 'ok';
    return { status, counts, total: findings.length };
}
