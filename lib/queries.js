// Vendored from @silentjma/n8n-nodes-unraid v0.1.0 (dist/lib/queries.js). Update with: npm run sync-rules
"use strict";
// GraphQL documents used by the Unraid nodes, written against api/generated-schema.graphql from github.com/unraid/api.
Object.defineProperty(exports, "__esModule", { value: true });
exports.M = exports.Q = exports.METRICS_FIELDS = exports.NOTIFICATION_FIELDS = exports.PHYSICAL_DISK_FIELDS = exports.ARRAY_FIELDS = exports.PARITY_FIELDS = exports.ARRAY_DISK_FIELDS = exports.CONTAINER_FIELDS = void 0;
exports.CONTAINER_FIELDS = `
	id names image imageId state status created autoStart autoStartOrder
	isUpdateAvailable isRebuildReady isOrphaned webUiUrl iconUrl projectUrl
	ports { ip privatePort publicPort type }`;
exports.ARRAY_DISK_FIELDS = `
	id idx name device size status type temp warning critical rotational isSpinning
	numReads numWrites numErrors fsSize fsFree fsUsed fsType comment`;
exports.PARITY_FIELDS = 'date duration speed status errors progress correcting paused running';
exports.ARRAY_FIELDS = `
	id state
	capacity { kilobytes { free used total } disks { free used total } }
	parityCheckStatus { ${exports.PARITY_FIELDS} }
	parities { ${exports.ARRAY_DISK_FIELDS} }
	disks { ${exports.ARRAY_DISK_FIELDS} }
	caches { ${exports.ARRAY_DISK_FIELDS} }
	boot { ${exports.ARRAY_DISK_FIELDS} }`;
exports.PHYSICAL_DISK_FIELDS = 'id device type name vendor size firmwareRevision serialNum interfaceType smartStatus temperature isSpinning';
exports.NOTIFICATION_FIELDS = 'id title subject description importance link type timestamp formattedTimestamp';
exports.METRICS_FIELDS = `
	cpu { percentTotal }
	memory { total used free available percentTotal swapTotal swapUsed percentSwapTotal }`;
exports.Q = {
    online: '{ online }',
    info: `{
		online
		info {
			time
			os { platform distro release kernel arch hostname uptime }
			cpu { manufacturer brand cores threads speed speedmax }
			system { manufacturer model virtual }
		}
	}`,
    metrics: `{ metrics { ${exports.METRICS_FIELDS} } }`,
    array: `{ array { ${exports.ARRAY_FIELDS} } }`,
    parityHistory: `{ parityHistory { ${exports.PARITY_FIELDS} } }`,
    disks: `{ disks { ${exports.PHYSICAL_DISK_FIELDS} } }`,
    shares: '{ shares { id name free used size comment cache include exclude splitLevel } }',
    containers: `{ docker { containers { ${exports.CONTAINER_FIELDS} } } }`,
    containerNames: '{ docker { containers { id names state } } }',
    container: `query ($id: PrefixedID!) { docker { container(id: $id) { ${exports.CONTAINER_FIELDS} } } }`,
    containerLogs: `query ($id: PrefixedID!, $since: DateTime, $tail: Int) {
		docker { logs(id: $id, since: $since, tail: $tail) { containerId cursor lines { timestamp message } } }
	}`,
    containerUpdateStatuses: '{ docker { containerUpdateStatuses { name updateStatus } } }',
    vms: '{ vms { domains { id name state } } }',
    logFiles: '{ logFiles { name path size modifiedAt } }',
    logFile: `query ($path: String!, $lines: Int, $startLine: Int) {
		logFile(path: $path, lines: $lines, startLine: $startLine) { path content totalLines startLine }
	}`,
    notifications: `query ($filter: NotificationFilter!) { notifications { list(filter: $filter) { ${exports.NOTIFICATION_FIELDS} } } }`,
    notificationOverview: `{ notifications { overview {
		unread { info warning alert total }
		archive { info warning alert total }
	} } }`,
    warningsAndAlerts: `{ notifications { warningsAndAlerts { ${exports.NOTIFICATION_FIELDS} } } }`,
    health: `{
		info { os { hostname uptime } }
		array { ${exports.ARRAY_FIELDS} }
		disks { ${exports.PHYSICAL_DISK_FIELDS} }
		docker { containers { ${exports.CONTAINER_FIELDS} } }
		notifications { warningsAndAlerts { ${exports.NOTIFICATION_FIELDS} } }
		metrics { ${exports.METRICS_FIELDS} }
	}`,
};
exports.M = {
    arraySetState: `mutation ($input: ArrayStateInput!) { array { setState(input: $input) { id state } } }`,
    parityStart: 'mutation ($correct: Boolean!) { parityCheck { start(correct: $correct) } }',
    parityPause: 'mutation { parityCheck { pause } }',
    parityResume: 'mutation { parityCheck { resume } }',
    parityCancel: 'mutation { parityCheck { cancel } }',
    dockerAction: (action) => `mutation ($id: PrefixedID!) { docker { ${action}(id: $id) { ${exports.CONTAINER_FIELDS} } } }`,
    dockerUpdateMany: `mutation ($ids: [PrefixedID!]!) { docker { updateContainers(ids: $ids) { ${exports.CONTAINER_FIELDS} } } }`,
    dockerUpdateAll: `mutation { docker { updateAllContainers { ${exports.CONTAINER_FIELDS} } } }`,
    dockerRefreshDigests: 'mutation { refreshDockerDigests }',
    vmAction: (action) => `mutation ($id: PrefixedID!) { vm { ${action}(id: $id) } }`,
    createNotification: `mutation ($input: NotificationData!) { createNotification(input: $input) { ${exports.NOTIFICATION_FIELDS} } }`,
    notifyIfUnique: `mutation ($input: NotificationData!) { notifyIfUnique(input: $input) { ${exports.NOTIFICATION_FIELDS} } }`,
    archiveNotification: `mutation ($id: PrefixedID!) { archiveNotification(id: $id) { ${exports.NOTIFICATION_FIELDS} } }`,
    archiveAll: `mutation ($importance: NotificationImportance) { archiveAll(importance: $importance) {
		unread { info warning alert total } archive { info warning alert total }
	} }`,
};
