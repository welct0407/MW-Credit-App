/* Dashboard 4 · Infrastructure (mw-infra): capacity against documented limits, last 24 hours. */
'use strict';
const L = require('./lib.cjs');
const {DS, COLOR, col, target, pos, byName, AGE, steps, valueMap, monitoringUrl, customFilter, jq} = L;

// Lifted chart with only its threshold line replaced by the documented limit or alert value (INFRA-1).
function liftWithLine(id, newId, gridPos, title, line, extraSteps = []) {
  const p = L.lift(L.PERF, id, {id: newId, gridPos, title});
  const d = p.fieldConfig.defaults;
  d.custom = {...d.custom, thresholdsStyle: {mode: 'dashed'}};
  d.thresholds = steps([null, 'transparent'], ...(line == null ? [] : [[line, 'red']]), ...extraSteps);
  return p;
}

function cloudSql() {
  // FINAL2-4: short values so they fit the column; the dates are in the description.
  const facts = [
    {Fact: 'Tier', Value: 'db-g1-small'},
    {Fact: 'Storage', Value: 'SSD 10 GB, auto-grow'},
    {Fact: 'Max connections', Value: '200'}
  ];
  const uptime = L.liftTarget(L.PERF, 129);
  const backupFields = [{key: 'age_seconds', label: 'Age'}, {key: 'status', label: 'Last run'},
    {key: 'type', label: 'Type'}, {key: 'log_retention_days', label: 'PITR'}];
  const statFields = [{key: 'top1_share_percent', label: 'Share'}, {key: 'top1_calls_per_min', label: 'Calls / min'},
    {key: 'status', label: 'Read'}];
  const db = (refId, name) => target(refId, DS.gcp, monitoringUrl(L.sqlFilter('cloudsql.googleapis.com/database/postgresql/num_backends') +
    ' AND metric.labels.' + L.NUM_BACKENDS_DATABASE_LABEL + ' = "' + name + '"', {aligner: 'ALIGN_MEAN'}), L.numericSelector(),
    [col('time', 'Time', 'timestamp'), col('value', name)], {format: 'timeseries'});
  return [
    liftWithLine(31, 1, pos(0, 0, 6, 7), 'Cloud SQL CPU', 0.85),
    liftWithLine(32, 2, pos(6, 0, 6, 7), 'Cloud SQL memory', 85),
    liftWithLine(33, 3, pos(12, 0, 6, 7), 'Cloud SQL disk', 0.8),
    liftWithLine(34, 4, pos(18, 0, 6, 7), 'SQL connections', 160, [[200, COLOR.unknown]]),
    L.table({id: 5, title: 'Backups and restore points', gridPos: pos(0, 7, 8, 7),
      description: 'Debian collector worker_timing{cloud_sql_backup} from the SQL Admin API, read-only: Age of the newest successful automated backup (orange above 30 h, the alert value), Last run = the newest run\'s state (Success, Failed, Running), its Type (Auto = automated, Manual = on demand) and PITR = the transaction-log retention in days.',
      targets: [target('A', DS.gcp, monitoringUrl(customFilter('worker_timing', {component: 'cloud_sql_backup'})), jq('ops-health.jq', {FIELDS: backupFields}),
        backupFields.map(f => col(f.label, f.label)))],
      // FINAL3-2: explicit column widths (Grafana gives an unsized column at least 150 px, which cut Type and PITR).
      overrides: [byName('Age', {unit: AGE.unit, decimals: AGE.decimals, 'custom.width': 90, 'custom.cellOptions': {type: 'color-background', mode: 'basic'},
          ...L.ageColor(108000), mappings: [L.nullMap('—')]}),
        byName('Last run', {'custom.width': 80, mappings: valueMap([[0, 'Failed', COLOR.down], [1, 'Success', COLOR.ok], [2, 'Running', COLOR.text]], '—'),
          'custom.cellOptions': {type: 'color-background', mode: 'basic'}}),
        byName('Type', {'custom.width': 70, mappings: valueMap([[1, 'Auto', COLOR.text], [2, 'Manual', COLOR.text]], '—')}),
        byName('PITR', {'custom.width': 70, unit: 'd', mappings: [L.nullMap('—')]})]}),
    L.table({id: 6, title: 'Instance facts', gridPos: pos(8, 7, 8, 7),
      description: 'Configuration snapshots, dated (the only static text on this dashboard): tier db-g1-small since 16 Oct 2026; storage PD_SSD 10 GB with automatic increase since 17 Oct 2026; max_connections 200 (database flag) verified 22 Sep 2026. Plus PostgreSQL uptime from the collector\'s read-only reporting connection.',
      datasource: DS.mixed,
      targets: [L.inlineTarget('A', DS.gcp, facts, '.[]', [col('Fact', 'Fact', 'string'), col('Value', 'Value', 'string')]),
        {...uptime, refId: 'B', root_selector: '(' + uptime.root_selector + ') | {Fact: "PostgreSQL uptime", Value: (.UptimeText // "No report")}',
          columns: [col('Fact', 'Fact', 'string'), col('Value', 'Value', 'string')]}],
      transformations: [{id: 'merge', options: {}}],
      overrides: [byName('Fact', {'custom.width': 140})]}),
    L.timeseries({id: 7, title: 'Connections by DB', gridPos: pos(16, 14, 8, RUN_H),
      description: 'Cloud SQL num_backends per database (metric label ' + L.NUM_BACKENDS_DATABASE_LABEL + '); explains who holds connections. No threshold.',
      targets: [db('A', 'loan_manager_prod'), db('B', 'mw_agent'), db('C', 'loan_manager_dev')],
      defaults: {min: 0}}),
    L.table({id: 8, title: 'Top statement', gridPos: pos(16, 7, 8, 4),
      description: 'Debian collector worker_timing{pg_stat}: Share of total execution time and Calls / min of the heaviest statement in monitoring.pg_stat_statements; Read = whether the collector may read the view. The statement text stays in the collector\'s local log.',
      targets: [target('A', DS.gcp, monitoringUrl(customFilter('worker_timing', {component: 'pg_stat'})), jq('ops-health.jq', {FIELDS: statFields}),
        statFields.map(f => col(f.label, f.label)))],
      overrides: [byName('Share', {'custom.width': 80, unit: 'percent', mappings: [L.nullMap('No report')]}),
        byName('Calls / min', {'custom.width': 100}),
        byName('Read', {'custom.width': 110, mappings: valueMap([[0, 'Not granted', COLOR.unknown], [1, 'Read', COLOR.ok]], 'No report')})]})
  ];
}

const RUN_SERVICES = ['read', 'command', 'notify', 'jobs', 'chat'].flatMap(s => ['prod', 'dev'].map(e => 'mw-credit-app-' + s + '-' + e));
// From infrastructure/production/runtime.tf, infrastructure/{production,dev}/chat-service.tf, infrastructure/dev/*-service.tf
// and modules/workers.
const MAX_INSTANCES = {'read-prod': 1, 'command-prod': 2, 'notify-prod': 1, 'jobs-prod': 1, 'chat-prod': 2,
  'read-dev': 2, 'command-dev': 2, 'notify-dev': 1, 'jobs-dev': 1, 'chat-dev': 2};
// R093: ten rows at the md row height need 14 grid rows (layout model); everything below moves down with it.
const RUN_H = 14, BELOW = 14 + RUN_H;
function cloudRun() {
  const filter = metric => 'metric.type = "' + metric + '" AND resource.type = "cloud_run_revision" AND resource.labels.service_name = one_of(' +
    RUN_SERVICES.map(s => '"' + s + '"').join(',') + ')';
  const q = (refId, metric, column, mode, aggregation) => target(refId, DS.gcp,
    monitoringUrl(filter(metric), {...aggregation, groupBy: ['resource.labels.service_name']}),
    jq('cloudrun-by-service.jq', {COLUMN: column, MODE: mode}), [col('Service', 'Service', 'string'), col(column, column)]);
  // FINAL4-2: a coloured cell with white text (the fills give at least 4.5:1 in both themes); the darker fills
  // would be too dim as coloured text on the dark theme.
  const util = {unit: 'percentunit', decimals: 0, 'custom.cellOptions': {type: 'color-background', mode: 'basic'},
    thresholds: steps([null, COLOR.ok], [0.8, COLOR.degraded]), mappings: [L.nullMap('—')]};
  return L.table({id: 9, title: 'Cloud Run · ten services', gridPos: pos(0, 14, 16, RUN_H),
    description: 'Cloud Monitoring per service of mw-credit-app-<service>-<env>: newest instance count against Max instances (Terraform), CPU and memory utilisation p95 over the newest 15 minutes (orange above 80 %) and billable instance time over the range. The chat service keeps its CPU allocated between requests (cpu_idle=false), so its billable time counts the instance lifetime, not request time only.',
    datasource: DS.gcp,
    targets: [
      L.inlineTarget('A', DS.gcp, Object.entries(MAX_INSTANCES).map(([Service, max]) => ({Service, Max: max})), '.[]',
        [col('Service', 'Service', 'string'), col('Max', 'Max')]),
      q('B', 'run.googleapis.com/container/instance_count', 'Instances', 'last', {aligner: 'ALIGN_MAX', reducer: 'REDUCE_SUM', period: '300s'}),
      q('C', 'run.googleapis.com/container/cpu/utilizations', 'CPU p95', 'last', {aligner: 'ALIGN_DELTA', reducer: 'REDUCE_PERCENTILE_95', period: '900s'}),
      q('D', 'run.googleapis.com/container/memory/utilizations', 'Memory p95', 'last', {aligner: 'ALIGN_DELTA', reducer: 'REDUCE_PERCENTILE_95', period: '900s'}),
      q('E', 'run.googleapis.com/container/billable_instance_time', 'Billable time', 'sum', {aligner: 'ALIGN_SUM', reducer: 'REDUCE_SUM', period: '3600s'})
    ],
    transformations: [{id: 'joinByField', options: {byField: 'Service', mode: 'outerTabular'}},
      {id: 'organize', options: {indexByName: {Service: 0, Instances: 1, Max: 2, 'CPU p95': 3, 'Memory p95': 4, 'Billable time': 5}}}],
    // FINAL3-2: every column sized (an unsized column takes at least 150 px and cut Billable time at 1440 px).
    overrides: [byName('CPU p95', {...util, 'custom.width': 80}), byName('Memory p95', {...util, 'custom.width': 100}),
      // FINAL4-6: one decimal, so a minute reads "1.0 mins", never "1 mins".
      byName('Billable time', {unit: 's', decimals: 1, mappings: [L.nullMap('—')], 'custom.width': 110}),
      byName('Instances', {mappings: [L.nullMap('0 seen')], 'custom.width': 80}), byName('Max', {'custom.width': 50}),
      // RECHECK-9/FINAL-3: service names without the common prefix ("command · prod"), so every column fits on a phone.
      byName('Service', {'custom.width': 110, mappings: [{type: 'regex', options: {pattern: '^mw-credit-app-(.+)-(prod|dev)$', result: {text: '$1 · $2', index: 0}}}]})]});
}

function debian() {
  const uptime = L.lift(L.PERF, 128, {id: 18, gridPos: pos(16, 11, 8, 3), title: 'Debian VM uptime'});
  // LIVE-3: an informational value, not Paused blue.
  uptime.fieldConfig.defaults.color = {mode: 'fixed', fixedColor: COLOR.text};
  // One value: the title names it (no "Uptime" under it), at the one-value tile size.
  uptime.options = {...uptime.options, ...L.SINGLE_VALUE};
  const disk = L.lift(L.PERF, 24, {id: 13, gridPos: pos(18, BELOW, 6, 7), title: 'Debian VM disk'});
  disk.description = (disk.description || '').trim() + ' Snapshot age: Backups and recovery points on Now.';
  disk.fieldConfig.defaults.decimals = 1; // FINAL3-3: no repeated axis labels ("4 MB/s" twice).
  return [
    L.lift(L.PERF, 21, {id: 10, gridPos: pos(0, BELOW, 6, 7), title: 'Debian VM CPU'}),
    liftWithLine(22, 11, pos(6, BELOW, 6, 7), 'Debian VM memory', 85),
    L.lift(L.PERF, 23, {id: 12, gridPos: pos(12, BELOW, 6, 7), title: 'Debian VM network'}),
    disk, uptime
  ];
}

// First line of a probe's details plus its HTTP code, probe duration, archive lag or snapshot age.
const ONE_LINE = '(split("\\n") as $l | [$l[0], ($l[] | (capture("^HTTP: (?<v>.+)$") | "HTTP " + .v), ' +
  '(capture("^Probe duration: (?<v>.+)$") | .v), (capture("^Archive lag: (?<v>.+)$") | "lag " + .v), ' +
  '(capture("^Snapshot age: (?<v>.+?)[.]?$") | .v + " old"))] | join(" · "))';
/* R090 (owner: fix the intermittent error badge on Metabase RAM): the lifted CPU and RAM charts sent four
 * Railway metrics calls each, and with the probes the page sent about ten at once, so Railway's API rate
 * limit failed one now and then. Each chart now sends one call: both services under GraphQL aliases, usage
 * and limit in one measurements list (as the Now gauge already does), folded into one frame per timestamp
 * with the same four series names, so the dashed limit override still applies. */
const RAILWAY_PROJECT = 'c8e57452-36dc-41f1-8d00-856b521a96c7';
const RAILWAY_ENVIRONMENT = 'df3ba125-0d62-446a-b4d8-5196780982c9';
const RAILWAY_SERVICES = {Metabase: '2959d509-c829-4420-8650-e72827d88170', Postgres: '6ba627ff-bc6d-41e7-8182-6c0f1fb03998'};
const RAILWAY_PAIR_SELECTOR = 'if .errors then error(.errors | tostring) else [.data | to_entries[] | .key as $s | .value[] | ' +
  '(if (.measurement | test("LIMIT")) then $s + " limit" else $s end) as $n | .values[] | {ts, n: $n, value}] | ' +
  'group_by(.ts) | map({time: (.[0].ts * 1000)} + (map({(.n): .value}) | add)) | sort_by(.time) | .[] end';
function railwayPair(oldId, usage, limit) {
  const t = L.liftTarget(L.PERF, oldId, 'A');
  const call = ([name, id]) => name + ': metrics(projectId:"' + RAILWAY_PROJECT + '",environmentId:"' + RAILWAY_ENVIRONMENT + '",serviceId:"' + id +
    '",startDate:"${__timeFrom:date:iso}",endDate:"${__timeTo:date:iso}",measurements:[' + usage + ',' + limit +
    '],sampleRateSeconds:300,averagingWindowSeconds:300) {measurement values{ts value}}';
  const names = Object.keys(RAILWAY_SERVICES);
  return {...t, url_options: {...t.url_options, data: JSON.stringify({query: '{ ' + Object.entries(RAILWAY_SERVICES).map(call).join(' ') + ' }'})},
    root_selector: RAILWAY_PAIR_SELECTOR,
    columns: [col('time', 'Time', 'timestamp_epoch'), ...[...names, ...names.map(n => n + ' limit')].map(n => col(n, n))]};
}
function railwayChart(oldId, opts, usage, limit) {
  const panel = L.lift(L.PERF, oldId, opts);
  panel.targets = [railwayPair(oldId, usage, limit)];
  // One frame: its field names are the series names, so drop lift()'s per-query names (they would rename all four).
  panel.fieldConfig.overrides = panel.fieldConfig.overrides.filter(o => o.matcher.id !== 'byFrameRefID');
  return panel;
}

function metabase() {
  // RECHECK-8: today's selectors unchanged, their multi-line details folded to one line (state, HTTP code and
  // duration, archive lag or snapshot age); the static explanation of each row is in the description.
  const probes = [80, 81, 82, 83, 84, 85, 86].map((id, i) => {
    const t = L.liftTarget(L.PERF, id);
    return {...t, refId: String.fromCharCode(65 + i), root_selector: '(' + t.root_selector + ') | .details |= ' + ONE_LINE};
  });
  const mem = railwayChart(42, {id: 15, gridPos: pos(8, BELOW + 7, 8, 10), title: 'Metabase RAM'}, 'MEMORY_USAGE_GB', 'MEMORY_LIMIT_GB');
  mem.description = (mem.description || '').trim() + ' The alert fires at 90 % of the limit.';
  return [
    railwayChart(41, {id: 14, gridPos: pos(0, BELOW + 7, 8, 10), title: 'Metabase CPU'}, 'CPU_USAGE', 'CPU_LIMIT'),
    mem,
    L.lift(L.PERF, 43, {id: 16, gridPos: pos(16, BELOW + 7, 8, 10), title: 'Postgres volume'}),
    // FINAL2-4: full width, so each probe's one-line details are not cut.
    L.table({id: 17, title: 'Metabase probes', gridPos: pos(0, BELOW + 17, 24, 10),
      description: 'Today\'s Metabase probe, backup and PITR selectors (Debian collector about every 2 minutes, and the Railway API), one row each: Platform = /livez on reports.mw-credit.com; App DB = /readyz including the application database; Reporting DB = an uncached saved SELECT 1 through source 2; Charts = charts.mw-credit.com shell and protected API; Daily and Weekly backup = the newest scheduled Railway volume snapshot (Degraded past 30 h or 8 days, a listed snapshot is not a tested restore); PITR archive = pgBackRest coverage and WAL archive lag. Details shows the state, HTTP code and probe duration, the archive lag or the snapshot age. Degraded = slower than 5 s.',
      datasource: DS.mixed, targets: probes,
      transformations: [{id: 'merge', options: {}}, {id: 'organize', options: {indexByName: {Status: 0, Details: 1}}}],
      overrides: [byName('Status', {mappings: L.stateMappings(), 'custom.cellOptions': {type: 'color-background', mode: 'basic'}, 'custom.width': 90, 'custom.minWidth': 90}),
        byName('Details', {'custom.cellOptions': {type: 'auto', wrapText: false}})]})
  ];
}

const VM_TITLES = {13: 'Network transfer'}; // FINAL2-2: titles that fit one line on a phone.
function azure() {
  const y0 = BELOW + 27;
  return L.row({id: 20, title: 'Azure VM-01 · on-demand operator host (no 24x7 expectation, no alert)', gridPos: pos(0, y0, 24, 1), collapsed: true,
    panels: [[11, 21, 0, y0 + 1], [12, 22, 12, y0 + 1], [13, 23, 0, y0 + 8], [14, 24, 12, y0 + 8]].map(([old, id, x, y]) =>
      L.lift(L.PERF, old, {id, gridPos: pos(x, y, 12, 7), title: 'VM-01 · ' + (VM_TITLES[old] || L.findPanel(L.PERF, old).title)}))});
}

// FINAL2-4: chart legends as a list below the chart with the full series names (the lifted table legends
// with Last and Max columns cut the names in a 6-column panel); values stay in the tooltip.
function listLegend(panel) {
  if (panel.type === 'timeseries') panel.options = {...panel.options, legend: {calcs: [], displayMode: 'list', placement: 'bottom', showLegend: true}};
  for (const child of panel.panels || []) listLegend(child);
  return panel;
}

function build() {
  return L.dashboard({uid: 'mw-infra', description: 'Capacity and limits: Cloud SQL, Cloud Run, the Debian VM, Metabase on Railway and the on-demand Azure VM-01.',
    time: {from: 'now-24h', to: 'now'}, refresh: '5m',
    panels: [...cloudSql(), cloudRun(), ...debian(), ...metabase(), azure()].map(listLegend)});
}
module.exports = {build, MAX_INSTANCES};
