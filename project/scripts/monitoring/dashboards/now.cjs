/* Dashboard 1 · Now (mw-now, home): PROD only, last 3 hours, refresh 1 m. */
'use strict';
const L = require('./lib.cjs');
const {DS, COLOR, col, target, pos, byName, byRef, AGE, steps, valueMap, monitoringUrl, customFilter, jq} = L;

function services() {
  return L.stateTimeline({id: 1, title: 'PROD services', gridPos: pos(0, 0, 16, 12),
    description: 'One lane per PROD service; each sample is a state code (green OK, orange degraded, red down, blue paused, grey Unknown when the collector itself reports it). Debian collector health, Cloud Monitoring and scheduler logs; a lane is empty, with no label, before its first report and after 6 minutes without one (the Notify worker 2 minutes after its last attempt), never green.',
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
  return {id: 2, type: 'alertlist', title: 'Firing alerts', gridPos: pos(16, 0, 8, 5),
    description: 'Grafana alert rules in folder MW Resource Monitoring Alerts. Empty list = nothing firing. Paused rules (PWA 2m during observation) are not listed.',
    options: {alertInstanceLabelFilter: '', alertName: '', dashboardAlerts: false, folder: {uid: L.ALERT_FOLDER_UID, title: 'MW Resource Monitoring Alerts'},
      groupBy: [], groupMode: 'default', maxItems: 20, showInactiveAlerts: false, showInstances: false, sortOrder: 3,
      stateFilter: {error: true, firing: true, noData: true, normal: false, pending: true}, viewMode: 'list'}};
}

function freshness() {
  const q = (refId, label, filter, opts) => target(refId, DS.gcp, monitoringUrl(filter, opts), jq('freshness.jq', {LABEL: label}),
    [col('Source', 'Source', 'string'), col('Age', 'Age')]);
  return L.table({id: 3, title: 'Telemetry freshness', gridPos: pos(16, 5, 8, 7),
    description: 'Age of the newest sample per source; above 6 minutes the source is stale and every state built on it turns grey together. Cloud SQL CPU stands for the Cloud Monitoring ingestion delay.',
    targets: [
      q('A', 'Debian collector', customFilter('health', {component: 'database'})),
      q('B', 'Hosting check', customFilter('health', {component: 'pwa_hosting_prod'})),
      q('C', 'Metabase probes', customFilter('metabase_probe', {component: 'metabase_platform', field: 'status'})),
      q('D', 'Cloud Monitoring ingestion', L.sqlFilter('cloudsql.googleapis.com/database/cpu/utilization'))
    ],
    transformations: [{id: 'merge', options: {}}, {id: 'organize', options: {indexByName: {Source: 0, Age: 1}}}],
    overrides: [byName('Age', {unit: AGE.unit, decimals: AGE.decimals, 'custom.width': 110, 'custom.cellOptions': {type: 'color-background', mode: 'basic'},
      mappings: [{type: 'range', options: {from: L.STALE_SECONDS + 0.001, to: 1e12, result: {text: 'stale', color: COLOR.unknown, index: 0}}}, L.nullMap('stale')],
      thresholds: steps([null, COLOR.ok], [L.STALE_SECONDS, COLOR.unknown])})]});
}

// FINAL-2: one completion row, so the stat cannot reduce the state code instead of the time. FINAL2-3: the
// newest completion in the 3-hour window (scan-completion.jq), so a scan in progress no longer shows "—".
function scanSelector() {
  return '[\n' + jq('scan-completion.jq') + '] | map(select(.details == "Last scan completion")) | .[]';
}
/* D6: six targets, scan-completion.jq for Scan and receipt-pipeline.jq per stage. Shared with Agent 1.
 * COLOUR-2 (owner review): every stage is coloured by its health with the documented rules, as text
 * "<state code>|<value>" on its state colour (codedMappings):
 *   Scan       the IG polling health state (health{polling}: OK green, Degraded orange, Down red, Paused blue)
 *              with the last completion time (ICT); no fresh telemetry: grey "—";
 *   red        green at 0, red above (holds, unconfirmed postings, notification failures: broken now);
 *   orange     green at 0, orange above (overdue reviews: needs attention);
 *   stalled    a count of normal work, green unless the oldest waiting item is older than 600 s (the
 *              receipt stalled rule, receipt_health.py), then orange;
 *   overdue    reviews waiting, green unless overdue_reviews > 0 (orange); waiting itself is normal work.
 * stages: [key, label, rule]. */
const STAGE_RULES = {
  red: {code: 'if .v > 0 then 0 else 1 end'},
  orange: {code: 'if .v > 0 then 2 else 1 end'},
  stalled: {aux: 'oldest_pending_seconds', code: 'if (.a // 0) > 600 then 2 else 1 end'},
  overdue: {aux: 'overdue_reviews', code: 'if (.a // 0) > 0 then 2 else 1 end'}
};
function stageSelector(key, label, rule) {
  const r = STAGE_RULES[rule];
  if (!r) throw Error('Unknown stage rule ' + rule);
  const fields = r.aux ? [[key, key], [r.aux, r.aux]] : [[key, key]];
  return '(' + L.receiptFields(fields) + ') | {v: .' + key + (r.aux ? ', a: .' + r.aux : '') + '} |\n{"' + label +
    '": (if .v == null then null else ((' + r.code + ') | tostring) + "|" + (.v | tostring) end)}';
}
function stagesStat({id, title, gridPos, scan, stages, description}) {
  const pipeline = monitoringUrl(customFilter('receipt_pipeline'));
  // RECHECK-3: a current-state stat reads the same 3-hour window on Now and Agent, whatever the picker,
  // so both send the identical Scan request (Agent's 6-hour default had shown No report).
  return L.stat({id, title, gridPos, description, timeFrom: '3h', hideTimeOverride: true,
    targets: [
      target('A', DS.gcp, monitoringUrl(customFilter('worker_timing', {component: 'polling'})), scanSelector(), [col('status', scan, 'string')]),
      ...stages.map(([key, label, rule], i) => target(String.fromCharCode(66 + i), DS.gcp, pipeline, stageSelector(key, label, rule), [col(label, label, 'string')]))
    ],
    defaults: {color: {mode: 'fixed', fixedColor: COLOR.unknown}, mappings: L.codedMappings('—'), noValue: '—'},
    options: {reduceOptions: {calcs: ['last'], fields: L.namedFields([scan, ...stages.map(x => x[1])]), values: false}}});
}
function payments() {
  return stagesStat({id: 4, title: 'Payments pipeline', gridPos: pos(0, 12, 8, 17), scan: '1 · Scan · last run',
    stages: [['pending_images', '2 · Extract · waiting', 'stalled'], ['unnotified_holds', '3 · Validate · holds', 'red'],
      ['overdue_reviews', '4 · Review · overdue', 'orange'], ['unconfirmed_postings', '5 · Post · unconfirmed', 'red'],
      ['failed_notifications', '6 · Notify · failed', 'red']],
    description: 'Instagram to recorded payment: Debian receipt pipeline snapshot (receipt_pipeline) and IG scan timing (worker_timing polling). Every stage is coloured by its health: Scan by the IG polling state (green OK, orange Degraded, red Down, blue Paused) with the last completion time (ICT); Extract green unless the oldest waiting image is older than 10 minutes (orange, stalled); holds, unconfirmed postings and failed notifications green at 0, red above; overdue reviews green at 0, orange above. Unconfirmed postings need reconciliation, never a repeated Add. Paused or stale telemetry shows —.'});
}

function conversation() {
  return L.stat({id: 5, title: 'Partner chat', gridPos: pos(8, 12, 8, 8),
    description: 'Debian collector worker_timing{conversation}: Undelivered = finished turns whose reply notice is still not reserved after 5 minutes (field undelivered), Stuck = turns RUNNING over 15 minutes (stuck_running); both red above 0. Last turn = the newest answered turn\'s outcome (Verified; Review for a clarify or refuse answer; Failed for failed, unknown-write or interrupted) and its age (orange after 7 days without a turn). Rounds, durations and provider are on Agent & Receipts.',
    targets: [target('A', DS.gcp, monitoringUrl(customFilter('worker_timing', {component: 'conversation'})),
      jq('ops-health.jq', {FIELDS: [{key: 'undelivered', label: 'Undelivered'}, {key: 'stuck_running', label: 'Stuck'},
        {key: 'last_turn_state', label: 'Last turn'}, {key: 'last_turn_age_seconds', label: 'Last turn age'}]}),
      [col('Undelivered', 'Undelivered'), col('Stuck', 'Stuck'), col('Last turn', 'Last turn'), col('Last turn age', 'Last turn age')])],
    defaults: {color: {mode: 'fixed', fixedColor: COLOR.info}, mappings: [L.nullMap('No report')]},
    overrides: [byName('Undelivered', L.problemColor('red')), byName('Stuck', L.problemColor('red')),
      byName('Last turn', {mappings: valueMap([[0, 'Failed', COLOR.down], [1, 'Verified', COLOR.ok], [2, 'Review', COLOR.degraded]], 'No report')}),
      byName('Last turn age', {unit: AGE.unit, decimals: AGE.decimals, ...L.ageColor(L.LIMITS.lastTurnAge)})]});
}

function push() {
  return L.stat({id: 6, title: 'Push', gridPos: pos(16, 12, 8, 8),
    description: 'Debian collector worker_timing{pwa_notify} from monitoring.pwa_ops_health_v1() on loan_manager_prod: pending deliveries (orange from 5), oldest pending age (orange above 900 s, the alert value), delivered (Sent · 24 h) and failed in 24 h.',
    targets: [target('A', DS.gcp, monitoringUrl(customFilter('worker_timing', {component: 'pwa_notify'})),
      jq('ops-health.jq', {FIELDS: [{key: 'pending', label: 'Pending'}, {key: 'oldest_pending_seconds', label: 'Oldest pending'},
        {key: 'delivered_24h', label: 'Sent · 24 h'}, {key: 'failed_24h', label: 'Failed · 24 h'}]}),
      [col('Pending', 'Pending'), col('Oldest pending', 'Oldest pending'), col('Sent · 24 h', 'Sent · 24 h'), col('Failed · 24 h', 'Failed · 24 h')])],
    defaults: {color: {mode: 'fixed', fixedColor: COLOR.info}, mappings: [L.nullMap('No report')]},
    overrides: [byName('Pending', L.ageColor(L.LIMITS.pushPending)), byName('Oldest pending', {unit: AGE.unit, decimals: AGE.decimals, ...L.ageColor(900)}),
      byName('Failed · 24 h', L.problemColor('orange'))]});
}

// Notifications: newest scheduler bucket of the Now 1-D query, as an age; a failed bucket maps to Failed.
function notificationsAgeSelector() {
  return '[\n' + L.schedulerSelector() + '] | map(select(.value != null)) | last |\n' +
    '{Notifications: (if . == null then null elif .value == 0 then -1 else ([now - ((.time | fromdateiso8601) + 300), 0] | max | floor) end)}';
}
const NOTIFY_JOB = 'Notify job · last run';
function jobs() {
  const jobMap = valueMap([[-1, 'Failed', COLOR.down], [-2, 'Overdue', COLOR.degraded]], 'No report');
  return L.stat({id: 7, title: 'Scheduled jobs', gridPos: pos(8, 20, 8, 9),
    description: 'Time since each job last completed: daily charges and recent analytics from worker_timing{pwa_jobs} (orange when overdue: 90 000 s and 4 500 s, the alert values; red when the run failed; a job with no completed run at all also shows Overdue), the minute notification job (Notify job · last run) from its Cloud Scheduler attempts log (grey "stale" after 6 minutes).',
    targets: [
      target('A', DS.gcp, monitoringUrl(customFilter('worker_timing', {component: 'pwa_jobs'})),
        jq('ops-health.jq', {FIELDS: [{key: 'daily_charges_age_seconds', label: 'Daily charges', state_key: 'daily_charges_state'},
          {key: 'recent_analytics_age_seconds', label: 'Recent analytics', state_key: 'recent_analytics_state'}]}),
        [col('Daily charges', 'Daily charges'), col('Recent analytics', 'Recent analytics')]),
      target('B', DS.gcp, monitoringUrl(L.schedulerFilter('prod', 'notifications'), {aligner: 'ALIGN_SUM', period: '300s'}),
        notificationsAgeSelector(), [col('Notifications', NOTIFY_JOB)])
    ],
    defaults: {unit: AGE.unit, decimals: AGE.decimals, mappings: jobMap, color: {mode: 'thresholds'}},
    overrides: [byName('Daily charges', L.ageColor(90000)), byName('Recent analytics', L.ageColor(4500)),
      // The minute job: grey "stale" above 360 s, the freshness convention; no red (the scheduler alert pages).
      byName(NOTIFY_JOB, {thresholds: steps([null, COLOR.ok], [L.STALE_SECONDS, COLOR.unknown]),
        mappings: [...jobMap, {type: 'range', options: {from: L.STALE_SECONDS + 0.001, to: 1e12, result: {text: 'stale', color: COLOR.unknown, index: 3}}}]})]});
}

function gauge({id, title, description, gridPos, targets, overrides}) {
  return {id, type: 'bargauge', title, description, gridPos,
    datasource: targets.every(t => t.datasource.uid === targets[0].datasource.uid) ? targets[0].datasource : DS.mixed,
    targets,
    fieldConfig: {defaults: {color: {mode: 'thresholds'}, decimals: 0, min: 0, noValue: 'No data', thresholds: steps([null, COLOR.ok]), unit: 'none'}, overrides},
    options: {displayMode: 'lcd', legend: {showLegend: false}, maxVizHeight: 300, minVizHeight: 16, minVizWidth: 8, namePlacement: 'left',
      orientation: 'horizontal', reduceOptions: {calcs: ['lastNotNull'], fields: '', values: false}, showUnfilled: true, sizing: 'auto',
      text: {titleSize: 16, valueSize: 22}, valueMode: 'text'}};
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
  return gauge({id: 8, title: 'Cloud SQL capacity', gridPos: pos(0, 29, 12, 6),
    description: 'CPU, RAM, connections and disk of the shared instance mw-credit-pg-20261017 (Cloud Monitoring), newest 5-minute value; the bar end is the limit and the red cells start at the alert value (CPU 85 %, RAM 85 %, connections 160 of 200, disk 80 %).',
    targets: [lifted(L.PERF, 4, 'A'), lifted(L.PERF, 8, 'B'), lifted(L.PERF, 50, 'C'), lifted(L.PERF, 33, 'D')],
    overrides: [scale('A', 'CPU', 'percentunit', 1, 0.85), scale('B', 'RAM used', 'percent', 100, 85),
      scale('C', 'Connections', 'none', 200, 160), scale('D', 'Disk', 'percentunit', 1, 0.8)]});
}
function capacityHosts() {
  const command = target('C', DS.gcp, monitoringUrl('metric.type = "run.googleapis.com/container/instance_count" AND resource.type = "cloud_run_revision" AND resource.labels.service_name = "mw-credit-app-command-prod"',
    {aligner: 'ALIGN_MAX', reducer: 'REDUCE_SUM', period: '300s'}), L.numericSelector(), [col('time', 'Time', 'timestamp'), col('value', 'Command instances')], {format: 'timeseries'});
  const reader = lifted(L.PWA_PLATFORM, 5, 'D');
  return gauge({id: 9, title: 'Hosts and services', gridPos: pos(12, 29, 12, 6),
    description: 'Debian VM RAM (Ops Agent, red 85 %), Metabase RAM against its live Railway limit (red 90 %), PROD command instances (max 2, no alert) and reader p95 over 5 minutes (request timeout 15 s, no alert; "idle" without requests).',
    targets: [lifted(L.PERF, 7, 'A'), lifted(L.PERF, 9, 'B'), command, reader],
    overrides: [scale('A', 'Debian RAM', 'percent', 100, 85), scale('B', 'Metabase RAM', 'percent', 100, 90),
      scale('C', 'Command inst.', 'none', 2, null), scale('D', 'Reader p95', 'ms', 15000, null, {noValue: 'idle'})]});
}

function edge() {
  return L.stateTimeline({id: 16, title: 'Edge', gridPos: pos(0, 35, 16, 8),
    description: 'Public webhook check from the Singapore checker only (Cloud Monitoring uptime, empty after 12 minutes without a Singapore report) and the Debian collector\'s tunnel, Tailscale, local ingress, database path and audit relay health (empty after 6 minutes).',
    rows: [L.webhookRow('Webhook · Singapore'), L.healthRow('Cloudflare tunnel', 'tunnel'), L.healthRow('Tailscale', 'tailscale_node'),
      L.healthRow('Local ingress', 'webhook_local'), L.healthRow('Database path', 'database'), L.healthRow('Audit relay', 'audit_relay')]});
}

const BACKUP_SOURCES = ['Cloud SQL backup', 'Debian snapshot', 'Metabase daily', 'Metabase weekly', 'PITR archive', 'Audit retention'];
function backups() {
  const rows = [
    {component: 'cloud_sql_backup', label: 'Cloud SQL backup', age: 'age_seconds', status: 'status', red: 108000},
    {component: 'debian_snapshot', label: 'Debian snapshot', age: 'age_seconds', red: 108000}
  ];
  const wt = (refId, rs, metric = 'worker_timing') => target(refId, DS.gcp, monitoringUrl(customFilter(metric, {component: rs.map(r => r.component).length > 1 ? rs.map(r => r.component) : rs[0].component})),
    jq('backup-age.jq', {ROWS: rs}), [col('Source', 'Source', 'string'), col('Age', 'Age'), col('State', 'State')]);
  // Metabase daily and weekly rows reuse panels 84 and 85 unchanged (state from their grace rules), named here.
  // FINAL2-5: the age is derived from the same Railway response (newest snapshot of the DAILY or WEEKLY
  // schedule), so a row never shows OK with no age; no snapshot or an API error gives no age and its state.
  const railway = (refId, id, label, kind) => {
    const t = L.liftTarget(L.PERF, id);
    if (!t.root_selector.includes('"' + kind + '"')) throw Error('Panel ' + id + ' does not read the ' + kind + ' schedule');
    const age = 'def stamp: sub("[.][0-9]+Z$";"Z") | fromdateiso8601;\n' +
      '(if .errors then null else (.data.volumeInstanceBackupScheduleList // [] | map(select(.kind == "' + kind + '")) | first) as $s |\n' +
      '  (.data.volumeInstanceBackupList // [] | map(select($s != null and .scheduleId == $s.id)) | sort_by(.createdAt) | last) as $b |\n' +
      '  (if $b == null then null else ([now - ($b.createdAt | stamp), 0] | max | floor) end) end)';
    return {...t, refId, root_selector: '(' + age + ') as $age | (' + t.root_selector + ') | {Source: "' + label + '", Age: $age, State: .status}',
      columns: [col('Source', 'Source', 'string'), col('Age', 'Age'), col('State', 'State')]};
  };
  return L.table({id: 19, title: 'Backups and recovery points', gridPos: pos(16, 35, 8, 9),
    description: 'Age of the newest recovery point and its state against the documented grace: Cloud SQL automated backup and Debian disk snapshot 30 h (the alert value); Metabase daily and weekly volume backups from the Railway schedules; Metabase PITR archive and the agent audit retention run from the collector. The Metabase rows\' age is that of the newest scheduled snapshot. Age shows — when there is no recovery point (the state then says why).',
    // FINAL4-4: a fixed list of the six sources comes first and the merge keys every row by Source (the only
    // field all frames share), so a source whose query fails (the Railway read) keeps its row with Age "—"
    // and state Unknown instead of disappearing; the rows keep this order.
    targets: [L.inlineTarget('S', DS.gcp, BACKUP_SOURCES.map(Source => ({Source})), '.[]', [col('Source', 'Source', 'string')]),
      wt('A', rows), railway('B', 84, 'Metabase daily', 'DAILY'), railway('C', 85, 'Metabase weekly', 'WEEKLY'),
      wt('D', [{component: 'metabase_pitr', label: 'PITR archive', age: 'archive_age_seconds', status: 'status', status_is_state: true}], 'metabase_probe'),
      wt('E', [{component: 'audit_retention', label: 'Audit retention', age: 'age_seconds', status: 'result'}])],
    datasource: DS.mixed,
    transformations: [{id: 'merge', options: {}}, {id: 'organize', options: {indexByName: {Source: 0, Age: 1, State: 2}}}],
    overrides: [byName('Age', {unit: AGE.unit, decimals: AGE.decimals, 'custom.width': 90, mappings: [L.nullMap('—')]}),
      // A row without a state (its query failed) reads Unknown.
      byName('State', {mappings: L.stateMappings(), 'custom.width': 80, 'custom.cellOptions': {type: 'color-background', mode: 'basic'}, color: {mode: 'fixed', fixedColor: COLOR.unknown}})]});
}

function build() {
  return L.dashboard({uid: 'mw-now', description: 'Is MW Credit working right now? PROD only; the page the alert runbook opens first.',
    time: {from: 'now-3h', to: 'now'}, refresh: '1m',
    panels: [services(), alerts(), freshness(), payments(), conversation(), push(), jobs(), capacitySql(), capacityHosts(), edge(),
      L.providerStatus({id: 17, gridPos: pos(16, 20, 8, 9)}), backups()]});
}
module.exports = {build, stagesStat, scanSelector};
