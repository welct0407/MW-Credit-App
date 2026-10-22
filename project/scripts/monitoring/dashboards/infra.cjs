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
  const facts = [
    {Fact: 'Tier', Value: 'db-g1-small (since 16 Oct 2026)'},
    {Fact: 'Storage', Value: 'PD_SSD 10 GB, automatic increase (since 17 Oct 2026)'},
    {Fact: 'max_connections', Value: '200 (database flag, verified 22 Sep 2026)'}
  ];
  const uptime = L.liftTarget(L.PERF, 129);
  const backupFields = [{key: 'age_seconds', label: 'Last backup age'}, {key: 'status', label: 'Newest run'},
    {key: 'type', label: 'Type'}, {key: 'log_retention_days', label: 'PITR log retention'}];
  const statFields = [{key: 'top1_share_percent', label: 'Top statement share'}, {key: 'top1_calls_per_min', label: 'Calls per minute'},
    {key: 'status', label: 'Read'}];
  const db = (refId, name) => target(refId, DS.gcp, monitoringUrl(L.sqlFilter('cloudsql.googleapis.com/database/postgresql/num_backends') +
    ' AND metric.labels.' + L.NUM_BACKENDS_DATABASE_LABEL + ' = "' + name + '"', {aligner: 'ALIGN_MEAN'}), L.numericSelector(),
    [col('time', 'Time', 'timestamp'), col('value', name)], {format: 'timeseries'});
  return [
    liftWithLine(31, 1, pos(0, 0, 6, 7), 'Cloud SQL CPU', 0.85),
    liftWithLine(32, 2, pos(6, 0, 6, 7), 'Cloud SQL memory', 85),
    liftWithLine(33, 3, pos(12, 0, 6, 7), 'Cloud SQL disk', 0.8),
    liftWithLine(34, 4, pos(18, 0, 6, 7), 'Cloud SQL connections', 160, [[200, COLOR.unknown]]),
    L.table({id: 5, title: 'Backups and restore points', gridPos: pos(0, 7, 8, 5),
      description: 'Debian collector worker_timing{cloud_sql_backup} from the SQL Admin API, read-only: age of the newest successful automated backup (red above 30 h, the alert value), newest run state, its type and the transaction-log (PITR) retention.',
      targets: [target('A', DS.gcp, monitoringUrl(customFilter('worker_timing', {component: 'cloud_sql_backup'})), jq('ops-health.jq', {FIELDS: backupFields}),
        backupFields.map(f => col(f.label, f.label)))],
      overrides: [byName('Last backup age', {unit: AGE.unit, decimals: AGE.decimals, 'custom.cellOptions': {type: 'color-background', mode: 'basic'},
          thresholds: steps([null, COLOR.ok], [108000, COLOR.down]), mappings: [L.nullMap('No report')]}),
        byName('Newest run', {mappings: valueMap([[0, 'Failed', COLOR.down], [1, 'Successful', COLOR.ok], [2, 'Running', COLOR.text]], 'No report'),
          'custom.cellOptions': {type: 'color-background', mode: 'basic'}}),
        byName('Type', {mappings: valueMap([[1, 'Automated', COLOR.text], [2, 'On demand', COLOR.text]], 'No report')}),
        byName('PITR log retention', {unit: 'd', mappings: [L.nullMap('No report')]})]}),
    L.table({id: 6, title: 'Instance facts', gridPos: pos(8, 7, 8, 5),
      description: 'Configuration snapshots, dated (the only static text on this dashboard), plus PostgreSQL uptime from the collector\'s read-only reporting connection.',
      datasource: DS.mixed,
      targets: [L.inlineTarget('A', DS.gcp, facts, '.[]', [col('Fact', 'Fact', 'string'), col('Value', 'Value', 'string')]),
        {...uptime, refId: 'B', root_selector: '(' + uptime.root_selector + ') | {Fact: "PostgreSQL uptime", Value: (.UptimeText // "No report")}',
          columns: [col('Fact', 'Fact', 'string'), col('Value', 'Value', 'string')]}],
      transformations: [{id: 'merge', options: {}}],
      overrides: [byName('Fact', {'custom.width': 120})]}),
    L.timeseries({id: 7, title: 'Connections by database', gridPos: pos(16, 7, 8, 5),
      description: 'Cloud SQL num_backends per database (metric label ' + L.NUM_BACKENDS_DATABASE_LABEL + '); explains who holds connections. No threshold.',
      targets: [db('A', 'loan_manager_prod'), db('B', 'mw_agent'), db('C', 'loan_manager_dev')],
      defaults: {min: 0}}),
    L.table({id: 8, title: 'Top statement share', gridPos: pos(0, 12, 8, 5),
      description: 'Debian collector worker_timing{pg_stat}: share of total execution time and call rate of the heaviest statement in monitoring.pg_stat_statements. The statement text stays in the collector\'s local log.',
      targets: [target('A', DS.gcp, monitoringUrl(customFilter('worker_timing', {component: 'pg_stat'})), jq('ops-health.jq', {FIELDS: statFields}),
        statFields.map(f => col(f.label, f.label)))],
      overrides: [byName('Top statement share', {unit: 'percent', mappings: [L.nullMap('No report')]}),
        byName('Read', {mappings: valueMap([[0, 'Not granted', COLOR.unknown], [1, 'Read', COLOR.ok]], 'No report')})]})
  ];
}

const RUN_SERVICES = ['read', 'command', 'notify', 'jobs'].flatMap(s => ['prod', 'dev'].map(e => 'mw-credit-app-' + s + '-' + e));
// From infrastructure/production/runtime.tf, infrastructure/dev/*-service.tf and modules/workers.
const MAX_INSTANCES = {'read-prod': 1, 'command-prod': 2, 'notify-prod': 1, 'jobs-prod': 1, 'read-dev': 2, 'command-dev': 2, 'notify-dev': 1, 'jobs-dev': 1};
function cloudRun() {
  const filter = metric => 'metric.type = "' + metric + '" AND resource.type = "cloud_run_revision" AND resource.labels.service_name = one_of(' +
    RUN_SERVICES.map(s => '"' + s + '"').join(',') + ')';
  const q = (refId, metric, column, mode, aggregation) => target(refId, DS.gcp,
    monitoringUrl(filter(metric), {...aggregation, groupBy: ['resource.labels.service_name']}),
    jq('cloudrun-by-service.jq', {COLUMN: column, MODE: mode}), [col('Service', 'Service', 'string'), col(column, column)]);
  const util = {unit: 'percentunit', decimals: 0, 'custom.cellOptions': {type: 'color-background', mode: 'basic'},
    thresholds: steps([null, COLOR.ok], [0.8, COLOR.degraded]), mappings: [L.nullMap('—')]};
  return L.table({id: 9, title: 'Cloud Run · eight services', gridPos: pos(8, 12, 16, 5),
    description: 'Cloud Monitoring per service: newest instance count against max instances (Terraform), CPU and memory utilisation p95 over the newest 15 minutes (orange above 80 %) and billable instance time over the range.',
    datasource: DS.gcp,
    targets: [
      L.inlineTarget('A', DS.gcp, Object.entries(MAX_INSTANCES).map(([Service, max]) => ({Service, 'Max instances': max})), '.[]',
        [col('Service', 'Service', 'string'), col('Max instances', 'Max instances')]),
      q('B', 'run.googleapis.com/container/instance_count', 'Instances', 'last', {aligner: 'ALIGN_MAX', reducer: 'REDUCE_SUM', period: '300s'}),
      q('C', 'run.googleapis.com/container/cpu/utilizations', 'CPU p95', 'last', {aligner: 'ALIGN_DELTA', reducer: 'REDUCE_PERCENTILE_95', period: '900s'}),
      q('D', 'run.googleapis.com/container/memory/utilizations', 'Memory p95', 'last', {aligner: 'ALIGN_DELTA', reducer: 'REDUCE_PERCENTILE_95', period: '900s'}),
      q('E', 'run.googleapis.com/container/billable_instance_time', 'Billable time', 'sum', {aligner: 'ALIGN_SUM', reducer: 'REDUCE_SUM', period: '3600s'})
    ],
    transformations: [{id: 'joinByField', options: {byField: 'Service', mode: 'outerTabular'}},
      {id: 'organize', options: {indexByName: {Service: 0, Instances: 1, 'Max instances': 2, 'CPU p95': 3, 'Memory p95': 4, 'Billable time': 5}}}],
    overrides: [byName('CPU p95', util), byName('Memory p95', util), byName('Billable time', {unit: 's', decimals: 0, mappings: [L.nullMap('—')]}),
      byName('Instances', {mappings: [L.nullMap('0 seen')]})]});
}

function debian() {
  const uptime = L.lift(L.PERF, 128, {id: 18, gridPos: pos(18, 22, 6, 2), title: 'Debian VM uptime'});
  // LIVE-3: an informational value, not Paused blue.
  uptime.fieldConfig.defaults.color = {mode: 'fixed', fixedColor: COLOR.text};
  const disk = L.lift(L.PERF, 24, {id: 13, gridPos: pos(18, 17, 6, 5), title: 'Debian VM disk'});
  disk.description = (disk.description || '').trim() + ' Snapshot age: Backups and recovery points on Now.';
  return [
    L.lift(L.PERF, 21, {id: 10, gridPos: pos(0, 17, 6, 7), title: 'Debian VM CPU'}),
    liftWithLine(22, 11, pos(6, 17, 6, 7), 'Debian VM memory', 85),
    L.lift(L.PERF, 23, {id: 12, gridPos: pos(12, 17, 6, 7), title: 'Debian VM network'}),
    disk, uptime
  ];
}

function metabase() {
  const probes = [80, 81, 82, 83, 84, 85, 86].map((id, i) => ({...L.liftTarget(L.PERF, id), refId: String.fromCharCode(65 + i)}));
  const mem = L.lift(L.PERF, 42, {id: 15, gridPos: pos(6, 24, 6, 7), title: 'Metabase memory · GB'});
  mem.description = (mem.description || '').trim() + ' The alert fires at 90 % of the limit.';
  return [
    L.lift(L.PERF, 41, {id: 14, gridPos: pos(0, 24, 6, 7), title: 'Metabase CPU · cores'}),
    mem,
    L.lift(L.PERF, 43, {id: 16, gridPos: pos(12, 24, 6, 7), title: 'Postgres volume · GB'}),
    L.table({id: 17, title: 'Metabase probes', gridPos: pos(18, 24, 6, 7),
      description: 'Today\'s Metabase probe, backup and PITR selectors unchanged (Debian collector and Railway API): one row each with its state and details.',
      datasource: DS.mixed, targets: probes,
      transformations: [{id: 'merge', options: {}}, {id: 'organize', options: {indexByName: {Status: 0, Details: 1}}}],
      overrides: [byName('Status', {mappings: L.stateMappings(), 'custom.cellOptions': {type: 'color-background', mode: 'basic'}, 'custom.width': 90}),
        byName('Details', {'custom.cellOptions': {type: 'auto', wrapText: true}})]})
  ];
}

function azure() {
  return L.row({id: 20, title: 'Azure VM-01 · on-demand operator host (no 24x7 expectation, no alert)', gridPos: pos(0, 31, 24, 1), collapsed: true,
    panels: [[11, 21, 0, 32], [12, 22, 12, 32], [13, 23, 0, 39], [14, 24, 12, 39]].map(([old, id, x, y]) =>
      L.lift(L.PERF, old, {id, gridPos: pos(x, y, 12, 7), title: 'VM-01 · ' + L.findPanel(L.PERF, old).title}))});
}

function build() {
  return L.dashboard({uid: 'mw-infra', description: 'Capacity and limits: Cloud SQL, Cloud Run, the Debian VM, Metabase on Railway and the on-demand Azure VM-01.',
    time: {from: 'now-24h', to: 'now'}, refresh: '5m',
    panels: [...cloudSql(), cloudRun(), ...debian(), ...metabase(), azure()]});
}
module.exports = {build, MAX_INSTANCES};
