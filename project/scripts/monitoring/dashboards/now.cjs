/* Dashboard 1 · Now (mw-now, home): PROD only, last 3 hours, refresh 1 m. */
'use strict';
const L = require('./lib.cjs');
const {DS, COLOR, col, target, pos, byName, byRef, AGE, steps, valueMap, monitoringUrl, customFilter, jq} = L;

function services() {
  return L.stateTimeline({id: 1, title: 'PROD services', gridPos: pos(0, 0, 16, 11),
    description: 'One lane per PROD service; each sample is a state code (green OK, orange degraded, red down, blue paused, grey unknown). Debian collector health, Cloud Monitoring and scheduler logs; a lane ends blank or grey after 6 minutes without a report, never green.',
    rows: [
      L.healthRow('Hosting', 'pwa_hosting_prod'),
      L.healthRow('Reader API', 'pwa_api_reader_prod'),
      L.healthRow('Command API', ['pwa_api_command_prod', 'oltp', 'olap']),
      L.schedulerRow('Notify worker', 'prod', 'notifications'),
      L.workerRow('Jobs worker', 'pwa_jobs', 'status'),
      L.sqlUpRow('Cloud SQL'),
      L.healthRow('Recognizer', 'recognizer'),
      L.healthRow('Receipt cycle', 'receipts'),
      L.healthRow('Conversation', 'conversations'),
      L.probeRow('Metabase', 'metabase_platform')
    ]});
}

function alerts() {
  return {id: 2, type: 'alertlist', title: 'Firing alerts', gridPos: pos(16, 0, 8, 6),
    description: 'Grafana alert rules in folder MW Resource Monitoring Alerts. Empty list = nothing firing. Paused rules (PWA 2m during observation) are not listed.',
    options: {alertInstanceLabelFilter: '', alertName: '', dashboardAlerts: false, folder: {uid: L.ALERT_FOLDER_UID, title: 'MW Resource Monitoring Alerts'},
      groupBy: [], groupMode: 'default', maxItems: 20, showInactiveAlerts: false, showInstances: true, sortOrder: 3,
      stateFilter: {error: true, firing: true, noData: true, normal: false, pending: true}, viewMode: 'list'}};
}

function freshness() {
  const q = (refId, label, filter, opts) => target(refId, DS.gcp, monitoringUrl(filter, opts), jq('freshness.jq', {LABEL: label}),
    [col('Source', 'Source', 'string'), col('Age', 'Age')]);
  return L.table({id: 3, title: 'Telemetry freshness', gridPos: pos(16, 6, 8, 5),
    description: 'Age of the newest sample per source; above 6 minutes the source is stale and every state built on it turns grey together. Cloud SQL CPU stands for the Cloud Monitoring ingestion delay.',
    targets: [
      q('A', 'Debian collector', customFilter('health', {component: 'database'})),
      q('B', 'Hosting check', customFilter('health', {component: 'pwa_hosting_prod'})),
      q('C', 'Metabase probes', customFilter('metabase_probe', {component: 'metabase_platform', field: 'status'})),
      q('D', 'Cloud Monitoring ingestion', L.sqlFilter('cloudsql.googleapis.com/database/cpu/utilization'))
    ],
    transformations: [{id: 'merge', options: {}}],
    overrides: [byName('Age', {unit: AGE.unit, decimals: AGE.decimals, 'custom.cellOptions': {type: 'color-background', mode: 'basic'},
      mappings: [{type: 'range', options: {from: L.STALE_SECONDS + 0.001, to: 1e12, result: {text: 'stale', color: COLOR.unknown, index: 0}}}, L.nullMap('stale')],
      thresholds: steps([null, COLOR.ok], [L.STALE_SECONDS, COLOR.unknown])})]});
}

// D6: six targets, group-scanning.jq for Scan and receipt-pipeline.jq once per stage field.
function payments() {
  const stages = [['pending_images', '2 · Extract · waiting'], ['unnotified_holds', '3 · Validate · holds'],
    ['overdue_reviews', '4 · Review · overdue'], ['unconfirmed_postings', '5 · Post · unconfirmed'],
    ['failed_notifications', '6 · Notify · failed']];
  const pipeline = monitoringUrl(customFilter('receipt_pipeline'));
  const red = name => byName(name, {color: {mode: 'thresholds'}, thresholds: steps([null, COLOR.ok], [1, COLOR.down])});
  return L.stat({id: 4, title: 'Payments · Instagram to recorded payment', gridPos: pos(0, 11, 9, 6),
    description: 'Debian receipt pipeline snapshot (receipt_pipeline) and IG scan timing (worker_timing polling). Holds, overdue reviews, unconfirmed postings and failed notifications turn red above 0; unconfirmed postings need reconciliation, never a repeated Add. Paused or stale telemetry shows No report.',
    targets: [
      target('A', DS.gcp, monitoringUrl(customFilter('worker_timing', {component: 'polling'})), jq('group-scanning.jq'), [col('status', '1 · Scan · last run')]),
      ...stages.map(([key, label], i) => target(String.fromCharCode(66 + i), DS.gcp, pipeline, L.receiptFields([[key, label]]), [col(key, label)]))
    ],
    defaults: {color: {mode: 'fixed', fixedColor: COLOR.paused}, mappings: [L.nullMap('No report')]},
    overrides: [byName('1 · Scan · last run', {unit: 'time:HH:mm', color: {mode: 'fixed', fixedColor: COLOR.paused}}),
      byName('2 · Extract · waiting', {color: {mode: 'fixed', fixedColor: COLOR.paused}}), ...stages.slice(1).map(([, label]) => red(label))],
    options: {reduceOptions: {calcs: ['last'], fields: '', values: false}, text: {titleSize: 11, valueSize: 22}}});
}

function conversation() {
  return L.stat({id: 5, title: 'Partner conversation', gridPos: pos(9, 11, 5, 6),
    description: 'Debian collector worker_timing{conversation}: queued and running turns, the newest turn\'s state and its age. Rounds, durations and provider are on Agent & Receipts.',
    targets: [target('A', DS.gcp, monitoringUrl(customFilter('worker_timing', {component: 'conversation'})),
      jq('ops-health.jq', {FIELDS: [{key: 'queued', label: 'Queued'}, {key: 'running', label: 'Running'},
        {key: 'last_turn_state', label: 'Last turn'}, {key: 'last_turn_age_seconds', label: 'Last turn age'}]}),
      [col('Queued', 'Queued'), col('Running', 'Running'), col('Last turn', 'Last turn'), col('Last turn age', 'Last turn age')])],
    defaults: {color: {mode: 'fixed', fixedColor: COLOR.paused}, mappings: [L.nullMap('No report')]},
    overrides: [byName('Last turn', {mappings: valueMap([[0, 'Failed', COLOR.down], [1, 'Verified', COLOR.ok], [2, 'Review', COLOR.degraded]], 'No report')}),
      byName('Last turn age', {unit: AGE.unit, decimals: AGE.decimals})],
    options: {text: {titleSize: 11, valueSize: 20}}});
}

function push() {
  return L.stat({id: 6, title: 'Push notifications', gridPos: pos(14, 11, 5, 6),
    description: 'Debian collector worker_timing{pwa_notify} from monitoring.pwa_ops_health_v1() on loan_manager_prod: pending deliveries, oldest pending age (red above 900 s, the alert value), delivered and failed in 24 h.',
    targets: [target('A', DS.gcp, monitoringUrl(customFilter('worker_timing', {component: 'pwa_notify'})),
      jq('ops-health.jq', {FIELDS: [{key: 'pending', label: 'Pending'}, {key: 'oldest_pending_seconds', label: 'Oldest pending'},
        {key: 'delivered_24h', label: 'Delivered · 24 h'}, {key: 'failed_24h', label: 'Failed · 24 h'}]}),
      [col('Pending', 'Pending'), col('Oldest pending', 'Oldest pending'), col('Delivered · 24 h', 'Delivered · 24 h'), col('Failed · 24 h', 'Failed · 24 h')])],
    defaults: {color: {mode: 'fixed', fixedColor: COLOR.paused}, mappings: [L.nullMap('No report')]},
    overrides: [byName('Oldest pending', {unit: AGE.unit, decimals: AGE.decimals, color: {mode: 'thresholds'}, thresholds: steps([null, COLOR.ok], [900, COLOR.down])}),
      byName('Failed · 24 h', {color: {mode: 'thresholds'}, thresholds: steps([null, COLOR.ok], [1, COLOR.degraded])})],
    options: {text: {titleSize: 11, valueSize: 20}}});
}

// Notifications: newest scheduler bucket of the Now 1-D query, as an age; a failed bucket maps to Failed.
function notificationsAgeSelector() {
  return '[\n' + L.schedulerSelector() + '] | map(select(.value != null)) | last |\n' +
    '{Notifications: (if . == null then null elif .value == 0 then -1 else ([now - ((.time | fromdateiso8601) + 300), 0] | max | floor) end)}';
}
function jobs() {
  const jobMap = valueMap([[-1, 'Failed', COLOR.down], [-2, 'Overdue', COLOR.down]], 'No report');
  return L.stat({id: 7, title: 'Scheduled jobs', gridPos: pos(19, 11, 5, 6),
    description: 'Time since each job last completed: daily charges and recent analytics from worker_timing{pwa_jobs} (red when overdue: 90 000 s and 4 500 s, the alert values), the minute notification job from its Cloud Scheduler attempts log.',
    targets: [
      target('A', DS.gcp, monitoringUrl(customFilter('worker_timing', {component: 'pwa_jobs'})),
        jq('ops-health.jq', {FIELDS: [{key: 'daily_charges_age_seconds', label: 'Daily charges', state_key: 'daily_charges_state'},
          {key: 'recent_analytics_age_seconds', label: 'Recent analytics', state_key: 'recent_analytics_state'}]}),
        [col('Daily charges', 'Daily charges'), col('Recent analytics', 'Recent analytics')]),
      target('B', DS.gcp, monitoringUrl(L.schedulerFilter('prod', 'notifications'), {aligner: 'ALIGN_SUM', period: '300s'}),
        notificationsAgeSelector(), [col('Notifications', 'Notifications')])
    ],
    defaults: {unit: AGE.unit, decimals: AGE.decimals, mappings: jobMap, color: {mode: 'thresholds'}},
    overrides: [byName('Daily charges', {thresholds: steps([null, COLOR.ok], [90000, COLOR.down])}),
      byName('Recent analytics', {thresholds: steps([null, COLOR.ok], [4500, COLOR.down])}),
      byName('Notifications', {thresholds: steps([null, COLOR.ok])})],
    options: {text: {titleSize: 11, valueSize: 20}}});
}

function gauge({id, title, description, gridPos, targets, overrides}) {
  return {id, type: 'bargauge', title, description, gridPos,
    datasource: targets.every(t => t.datasource.uid === targets[0].datasource.uid) ? targets[0].datasource : DS.mixed,
    targets,
    fieldConfig: {defaults: {color: {mode: 'thresholds'}, decimals: 0, min: 0, noValue: 'No data', thresholds: steps([null, COLOR.ok]), unit: 'none'}, overrides},
    options: {displayMode: 'lcd', legend: {showLegend: false}, maxVizHeight: 300, minVizHeight: 16, minVizWidth: 8, namePlacement: 'left',
      orientation: 'horizontal', reduceOptions: {calcs: ['lastNotNull'], fields: '', values: false}, showUnfilled: true, sizing: 'auto', valueMode: 'text'}};
}
function lifted(file, id, refId) {
  const t = L.liftTarget(file, id);
  t.refId = refId;
  return t;
}
function scale(refId, name, unit, max, red, extra = {}) {
  return byRef(refId, {displayName: name, unit, max, thresholds: red == null ? steps([null, COLOR.ok]) : steps([null, COLOR.ok], [red, COLOR.down]), ...extra});
}
function capacitySql() {
  return gauge({id: 8, title: 'Cloud SQL · CPU, memory, connections, disk', gridPos: pos(0, 17, 12, 5),
    description: 'Cloud Monitoring, shared instance mw-credit-pg-20261017, newest 5-minute value; the bar end is the limit and the red cells start at the alert value (CPU 85 %, RAM 85 %, connections 160 of 200, disk 80 %).',
    targets: [lifted(L.PERF, 4, 'A'), lifted(L.PERF, 8, 'B'), lifted(L.PERF, 50, 'C'), lifted(L.PERF, 33, 'D')],
    overrides: [scale('A', 'CPU', 'percentunit', 1, 0.85), scale('B', 'RAM used', 'percent', 100, 85),
      scale('C', 'Connections', 'none', 200, 160), scale('D', 'Disk', 'percentunit', 1, 0.8)]});
}
function capacityHosts() {
  const command = target('C', DS.gcp, monitoringUrl('metric.type = "run.googleapis.com/container/instance_count" AND resource.type = "cloud_run_revision" AND resource.labels.service_name = "mw-credit-app-command-prod"',
    {aligner: 'ALIGN_MAX', reducer: 'REDUCE_SUM', period: '300s'}), L.numericSelector(), [col('time', 'Time', 'timestamp'), col('value', 'Command instances')], {format: 'timeseries'});
  const reader = lifted(L.PWA_PLATFORM, 5, 'D');
  return gauge({id: 9, title: 'Hosts and services · RAM, instances, latency', gridPos: pos(12, 17, 12, 5),
    description: 'Debian VM RAM (Ops Agent, red 85 %), Metabase RAM against its live Railway limit (red 90 %), PROD command instances (max 2, no alert) and reader p95 over 5 minutes (request timeout 15 s, no alert; "idle" without requests).',
    targets: [lifted(L.PERF, 7, 'A'), lifted(L.PERF, 9, 'B'), command, reader],
    overrides: [scale('A', 'Debian VM RAM', 'percent', 100, 85), scale('B', 'Metabase RAM', 'percent', 100, 90),
      scale('C', 'Command instances', 'none', 2, null), scale('D', 'Reader p95', 'ms', 15000, null, {noValue: 'idle'})]});
}

function edge() {
  return L.stateTimeline({id: 16, title: 'Edge', gridPos: pos(0, 22, 16, 7),
    description: 'Public webhook check from the Singapore checker only (Cloud Monitoring uptime, grey after 12 minutes without a Singapore report) and the Debian collector\'s tunnel, Tailscale, local ingress, database path and audit relay health (grey after 6 minutes).',
    rows: [L.webhookRow('Webhook · Singapore'), L.healthRow('Cloudflare tunnel', 'tunnel'), L.healthRow('Tailscale', 'tailscale_node'),
      L.healthRow('Local ingress', 'webhook_local'), L.healthRow('Database path', 'database'), L.healthRow('Audit relay', 'audit_relay')]});
}

function backups() {
  const rows = [
    {component: 'cloud_sql_backup', label: 'Cloud SQL automated backup', age: 'age_seconds', status: 'status', red: 108000},
    {component: 'debian_snapshot', label: 'Debian disk snapshot', age: 'age_seconds', red: 108000}
  ];
  const wt = (refId, rs, metric = 'worker_timing') => target(refId, DS.gcp, monitoringUrl(customFilter(metric, {component: rs.map(r => r.component).length > 1 ? rs.map(r => r.component) : rs[0].component})),
    jq('backup-age.jq', {ROWS: rs}), [col('Source', 'Source', 'string'), col('Age', 'Age'), col('State', 'State')]);
  // Metabase daily and weekly rows reuse panels 84 and 85 unchanged (state from their grace rules), named here.
  const railway = (refId, id, label) => {
    const t = L.liftTarget(L.PERF, id);
    return {...t, refId, root_selector: '(' + t.root_selector + ') | {Source: "' + label + '", Age: null, State: .status}',
      columns: [col('Source', 'Source', 'string'), col('Age', 'Age'), col('State', 'State')]};
  };
  return L.table({id: 19, title: 'Backups and recovery points', gridPos: pos(16, 25, 8, 5),
    description: 'Age of the newest recovery point and its state against the documented grace (Cloud SQL and Debian 30 h, the alert value; Metabase daily and weekly from the Railway schedules; PITR archive and audit retention from the collector).',
    targets: [wt('A', rows), railway('B', 84, 'Metabase daily volume backup'), railway('C', 85, 'Metabase weekly volume backup'),
      wt('D', [{component: 'metabase_pitr', label: 'Metabase PITR archive', age: 'archive_age_seconds', status: 'status', status_is_state: true}], 'metabase_probe'),
      wt('E', [{component: 'audit_retention', label: 'Agent audit retention run', age: 'age_seconds', status: 'result'}])],
    datasource: DS.mixed,
    transformations: [{id: 'merge', options: {}}],
    overrides: [byName('Age', {unit: AGE.unit, decimals: AGE.decimals, mappings: [L.nullMap('—')]}),
      byName('State', {mappings: L.stateMappings(), 'custom.cellOptions': {type: 'color-background', mode: 'basic'}, color: {mode: 'thresholds'}, thresholds: steps([null, COLOR.unknown])})]});
}

function build() {
  return L.dashboard({uid: 'mw-now', description: 'Is MW Credit working right now? PROD only; the page the alert runbook opens first.',
    time: {from: 'now-3h', to: 'now'}, refresh: '1m',
    panels: [services(), alerts(), freshness(), payments(), conversation(), push(), jobs(), capacitySql(), capacityHosts(), edge(),
      L.providerStatus({id: 17, gridPos: pos(16, 22, 8, 3)}), backups()]});
}
module.exports = {build};
