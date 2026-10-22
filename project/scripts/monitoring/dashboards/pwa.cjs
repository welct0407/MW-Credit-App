/* Dashboard 2 · PWA & APIs (mw-pwa): one env switch instead of PROD and DEV copies. */
'use strict';
const L = require('./lib.cjs');
const {DS, COLOR, col, target, pos, byName, byRef, AGE, steps, valueMap, monitoringUrl, customFilter, jq, CHART_PERIOD} = L;

const SERVICES = [
  {key: 'read', label: 'reader', timeoutMs: 15000, maxInstances: 1},
  {key: 'command', label: 'command', timeoutMs: 55000, maxInstances: 2},
  {key: 'notify', label: 'notify', timeoutMs: 120000, maxInstances: 1},
  {key: 'jobs', label: 'jobs', timeoutMs: 120000, maxInstances: 1}
];
const run = (metric, service, suffix = '') => 'metric.type = "' + metric + '" AND resource.type = "cloud_run_revision" AND resource.labels.service_name = "mw-credit-app-' + service + '-${env}"' + suffix;
const ts = (refId, url, name, selector = L.numericSelector()) => target(refId, DS.gcp, url, selector, [col('time', 'Time', 'timestamp'), col('value', name)], {format: 'timeseries'});
// Collector panels read the PROD business database only; DEV shows "PROD only".
const prodOnly = selector => 'if "${env}" != "prod" then empty else (\n' + selector + ') end';

function hosting() {
  const p = L.lift(L.PWA_PLATFORM, 3, {id: 1, gridPos: pos(0, 0, 8, TOP), title: 'Hosting · ${env}'});
  for (const t of p.targets) t.url = t.url.replace('pwa_hosting_prod%22', 'pwa_hosting_${env}%22');
  if (!p.targets[0].url.includes('pwa_hosting_${env}')) throw Error('Hosting filter not parameterised');
  p.options = {...p.options, ...L.SINGLE_VALUE};
  return p;
}

function apiHealth() {
  const q = (refId, name, component) => target(refId, DS.gcp, monitoringUrl(customFilter('health', {component})), L.stateSelector(1),
    [col('time', 'Time', 'timestamp'), col('value', name)], {format: 'timeseries'});
  return L.stat({id: 2, title: 'API health', gridPos: pos(8, 0, 8, TOP),
    description: 'Reader and command API health: Debian collector GET /health on the ${env} reader and command services (no credentials, 10 s), plus the authenticated native OLTP and OLAP probes that always target PROD. Grey after 6 minutes without a report.',
    targets: [q('A', 'Reader', 'pwa_api_reader_${env}'), q('B', 'Command', 'pwa_api_command_${env}'),
      q('C', 'Native OLTP · PROD', 'oltp'), q('D', 'Native OLAP · PROD', 'olap')],
    defaults: {mappings: L.stateMappings(L.STATE_TEXT, 'No report'), color: {mode: 'fixed', fixedColor: COLOR.unknown}},
    overrides: ['A', 'B', 'C', 'D'].map((r, i) => byRef(r, {displayName: ['Reader', 'Command', 'Native OLTP · PROD', 'Native OLAP · PROD'][i]})),
    options: {reduceOptions: {calcs: ['last'], fields: '', values: false}}});
}

function errors() {
  const code = (refId, name, value) => target(refId, DS.gcp, monitoringUrl('metric.type = "' + L.LOG_METRIC + 'mw_api_result_codes_${env}" AND metric.labels.code = "' + value + '"',
    {aligner: 'ALIGN_SUM', period: CHART_PERIOD}), jq('sum-points.jq'), [col('value', name)]);
  const fivexx = target('D', DS.gcp, monitoringUrl('metric.type = "run.googleapis.com/request_count" AND resource.type = "cloud_run_revision" AND resource.labels.service_name = monitoring.regex.full_match("mw-credit-app-(read|command|notify|jobs)-${env}") AND metric.labels.response_code_class = "5xx"',
    {aligner: 'ALIGN_SUM', reducer: 'REDUCE_SUM', period: CHART_PERIOD}), jq('sum-points.jq'), [col('value', '5xx · all services')]);
  return L.stat({id: 3, title: 'Sign-in and request errors', gridPos: pos(16, 0, 8, TOP),
    description: 'Counts over the selected range: log-based mw_api_result_codes_${env} by result code (from the services\' structured request log, no user identity) and Cloud Run 5xx responses across the four ${env} services. Counts only, no threshold.',
    // READ-1: names with spaces so they wrap on a phone (the codes are in the description).
    targets: [code('A', '401 · session invalid', 'session_invalid'), code('B', '503 · session check unavailable', 'session_check_unavailable'),
      code('C', '503 · body timeout', 'body_timeout'), fivexx],
    defaults: {color: {mode: 'fixed', fixedColor: COLOR.info}, noValue: 'None'},
    options: {reduceOptions: {calcs: ['lastNotNull'], fields: '', values: false}}});
}

const TOP = 8; // READ-1: the first row's height (four values at the larger text).
function serviceRow(s, index) {
  const y = TOP + index * 7, base = 10 + index, id = (base) * 10;
  const requests = L.timeseries({id: id + 1, title: 'Requests / 5 min · ' + s.label, gridPos: pos(0, y + 1, 8, 6),
    description: 'Cloud Run request_count for mw-credit-app-' + s.key + '-${env}, summed across revisions per 5 minutes; 4xx (client or sign-in rejection) and 5xx (server failure) are subsets of All. No threshold.',
    targets: [['A', 'All', ''], ['B', '4xx', ' AND metric.labels.response_code_class = "4xx"'], ['C', '5xx', ' AND metric.labels.response_code_class = "5xx"']]
      .map(([r, name, suffix]) => ts(r, monitoringUrl(run('run.googleapis.com/request_count', s.key, suffix), {aligner: 'ALIGN_SUM', reducer: 'REDUCE_SUM', period: '300s'}), name)),
    defaults: {min: 0, noValue: 'No requests'},
    overrides: [['All', COLOR.paused, 'solid'], ['4xx', COLOR.degraded, 'dash'], ['5xx', 'red', 'dot']].map(([name, color, fill]) =>
      ({matcher: {id: 'byName', options: name}, properties: [{id: 'color', value: {fixedColor: color, mode: 'fixed'}},
        {id: 'custom.lineStyle', value: fill === 'solid' ? {fill: 'solid'} : {dash: fill === 'dash' ? [10, 10] : [0, 10], fill}}]}))});
  const latency = L.timeseries({id: id + 2, title: 'p95 latency (ms) · ' + s.label, gridPos: pos(8, y + 1, 8, 6),
    description: 'Cloud Run request_latencies, distributions merged per 5 minutes then the 95th percentile across revisions; the red dashed line is the request timeout (' + s.timeoutMs / 1000 + ' s). Logarithmic axis.',
    targets: [ts('A', monitoringUrl(run('run.googleapis.com/request_latencies', s.key), {aligner: 'ALIGN_SUM', reducer: 'REDUCE_PERCENTILE_95', period: '300s'}), 'p95')],
    defaults: {unit: 'ms', min: 10, noValue: 'No requests', ...L.dashedLine(s.timeoutMs), custom: {scaleDistribution: {type: 'log', log: 10}, thresholdsStyle: {mode: 'dashed'}}}});
  const instances = L.timeseries({id: id + 3, title: s.label + ' · instances, CPU, RAM', gridPos: pos(16, y + 1, 8, 6),
    description: 'Cloud Run instance_count (max per 5 minutes, left axis; grey dashed line = PROD max instances ' + s.maxInstances + (s.key === 'command' ? ', DEV 1' : '') + ') and container CPU and memory utilisation p95 (right axis).',
    targets: [
      ts('A', monitoringUrl(run('run.googleapis.com/container/instance_count', s.key), {aligner: 'ALIGN_MAX', reducer: 'REDUCE_SUM', period: '300s'}), 'Instances'),
      ts('B', monitoringUrl(run('run.googleapis.com/container/cpu/utilizations', s.key), {aligner: 'ALIGN_DELTA', reducer: 'REDUCE_PERCENTILE_95', period: '300s'}), 'CPU p95'),
      ts('C', monitoringUrl(run('run.googleapis.com/container/memory/utilizations', s.key), {aligner: 'ALIGN_DELTA', reducer: 'REDUCE_PERCENTILE_95', period: '300s'}), 'Memory p95')
    ],
    defaults: {min: 0, noValue: 'No instances', custom: {thresholdsStyle: {mode: 'dashed'}}, thresholds: steps([null, 'transparent'], [s.maxInstances, COLOR.unknown])},
    overrides: ['CPU p95', 'Memory p95'].map(name => byName(name, {unit: 'percentunit', max: 1, 'custom.axisPlacement': 'right'}))
      .concat([byName('Instances', {'custom.drawStyle': 'line', 'custom.lineInterpolation': 'stepAfter', color: {fixedColor: 'purple', mode: 'fixed'}})])});
  return [L.row({id: base, title: 'Service · ' + s.key, gridPos: pos(0, y, 24, 1)}), requests, latency, instances];
}

function workers() {
  const y = TOP + SERVICES.length * 7;
  const header = L.row({id: 19, title: 'Workers', gridPos: pos(0, y, 24, 1)});
  const scheduler = L.stateTimeline({id: 20, title: 'Cloud Scheduler attempts', gridPos: pos(0, y + 1, 8, WORKERS),
    description: 'Log-based mw_scheduler_attempts_${env} per 5 minutes for the jobs notifications (Notify, every minute), daily-charges (Charges, 00:05) and recent-analytics (Analytics, hourly): green only successful attempts, red any failed attempt (status not OK or HTTP not 2xx). Each attempt\'s state holds until the job\'s next expected run (every minute: 2 min, hourly: 65 min, daily: 25 h); before the first attempt and after that the row is empty, with no label. DEV jobs are paused.',
    noValue: 'No attempt',
    rows: [L.schedulerRow('Notify · 1 min', '${env}', 'notifications', 'minute'), L.schedulerRow('Charges · 00:05', '${env}', 'daily-charges', 'daily'),
      L.schedulerRow('Analytics · hourly', '${env}', 'recent-analytics', 'hourly')]});
  const pushFields = [{key: 'pending', label: 'Pending'}, {key: 'oldest_pending_seconds', label: 'Oldest pending'},
    {key: 'delivered_24h', label: 'Sent · 24 h'}, {key: 'failed_24h', label: 'Failed · 24 h'}];
  const push = L.stat({id: 21, title: 'Push delivery', gridPos: pos(8, y + 1, 8, WORKERS),
    description: 'PROD only: worker_timing{pwa_notify} from monitoring.pwa_ops_health_v1(); pending counts pending and retry, failed counts dead and uncertain completed in 24 h. Oldest pending red above 900 s (the alert value).',
    targets: [target('A', DS.gcp, monitoringUrl(customFilter('worker_timing', {component: 'pwa_notify'})), prodOnly(jq('ops-health.jq', {FIELDS: pushFields})),
      pushFields.map(f => col(f.label, f.label)))],
    defaults: {color: {mode: 'fixed', fixedColor: COLOR.info}, mappings: [L.nullMap('No report')], noValue: 'PROD only'},
    overrides: [byName('Oldest pending', {unit: AGE.unit, decimals: AGE.decimals, color: {mode: 'thresholds'}, thresholds: steps([null, COLOR.ok], [900, COLOR.down])}),
      byName('Failed · 24 h', {color: {mode: 'thresholds'}, thresholds: steps([null, COLOR.ok], [1, COLOR.degraded])})]});
  const jobFields = [{key: 'daily_charges_age_seconds', label: 'Daily charges', state_key: 'daily_charges_state'},
    {key: 'recent_analytics_age_seconds', label: 'Recent analytics', state_key: 'recent_analytics_state'}];
  const jobs = L.stat({id: 22, title: 'Job freshness', gridPos: pos(16, y + 1, 8, WORKERS),
    description: 'PROD only: time since each job last completed (pwa_job_runs via worker_timing{pwa_jobs}; overdue red at 90 000 s and 4 500 s, the alert values; a job with no completed run at all also shows Overdue) and since the last notification was sent (Last notification, the last dispatch in pwa_notify).',
    targets: [
      target('A', DS.gcp, monitoringUrl(customFilter('worker_timing', {component: 'pwa_jobs'})), prodOnly(jq('ops-health.jq', {FIELDS: jobFields})), jobFields.map(f => col(f.label, f.label))),
      target('B', DS.gcp, monitoringUrl(customFilter('worker_timing', {component: 'pwa_notify'})),
        prodOnly(jq('ops-health.jq', {FIELDS: [{key: 'last_dispatch_age_seconds', label: 'Last notification'}]})), [col('Last notification', 'Last notification')])
    ],
    defaults: {unit: AGE.unit, decimals: AGE.decimals, color: {mode: 'thresholds'}, noValue: 'PROD only',
      mappings: valueMap([[-1, 'Failed', COLOR.down], [-2, 'Overdue', COLOR.down]], 'No report'), thresholds: steps([null, COLOR.ok])},
    overrides: [byName('Daily charges', {thresholds: steps([null, COLOR.ok], [90000, COLOR.down])}),
      byName('Recent analytics', {thresholds: steps([null, COLOR.ok], [4500, COLOR.down])})]});
  return [header, scheduler, push, jobs];
}

const WORKERS = 8;
function recognition() {
  const y = TOP + SERVICES.length * 7 + 1 + WORKERS;
  const header = L.row({id: 29, title: 'Receipt recognition route · command service to Debian recognizer', gridPos: pos(0, y, 24, 1)});
  // READ-1: one bar per outcome (up to eight, named in words), so every outcome fits at the larger text.
  const outcomes = {id: 30, type: 'bargauge', title: 'Recognitions', gridPos: pos(0, y + 1, 8, RECOGNITION),
    description: 'Log-based mw_recognition_outcome_${env}: recognitions on the command service over the selected range, one bar per warning (Clean = the form filled cleanly). Categories only; no slip content or amounts.',
    datasource: DS.gcp,
    targets: [target('A', DS.gcp, monitoringUrl('metric.type = "' + L.LOG_METRIC + 'mw_recognition_outcome_${env}"', {aligner: 'ALIGN_SUM', period: CHART_PERIOD}),
      jq('sum-by-label.jq', {LABEL: 'warning'}), [col('Outcome', 'Outcome', 'string'), col('Count', 'Count')])],
    // One value per outcome, named by the outcome (rows to fields), not one "Count" per row.
    transformations: [{id: 'rowsToFields', options: {mappings: [{fieldName: 'Outcome', handlerKey: 'field.name'}, {fieldName: 'Count', handlerKey: 'field.value'}]}}],
    fieldConfig: {defaults: {color: {mode: 'fixed', fixedColor: COLOR.paused}, decimals: 0, displayName: '${__field.name}', min: 0, noValue: 'No recognitions',
      thresholds: steps([null, COLOR.ok]), unit: 'none'},
      overrides: Object.entries(OUTCOMES).map(([code, name]) => byName(code, {displayName: name}))},
    options: {displayMode: 'basic', legend: {showLegend: false}, maxVizHeight: 300, minVizHeight: 16, minVizWidth: 8, namePlacement: 'left',
      orientation: 'horizontal', reduceOptions: {calcs: ['lastNotNull'], fields: '', values: false}, showUnfilled: true, sizing: 'auto',
      text: {titleSize: 16, valueSize: 22}, valueMode: 'text'}};
  const latency = L.timeseries({id: 31, title: 'Recognition route p95', gridPos: pos(8, y + 1, 8, RECOGNITION),
    description: 'Log-based distribution mw_recognition_route_latency_${env} from the request latency of POST /receipts/{id}/recognition; red dashed line = the 45 s route budget (the PWA deadline is 60 s).',
    targets: [ts('A', monitoringUrl('metric.type = "' + L.LOG_METRIC + 'mw_recognition_route_latency_${env}"', {aligner: 'ALIGN_DELTA', reducer: 'REDUCE_PERCENTILE_95', period: CHART_PERIOD}), 'p95')],
    defaults: {unit: 's', decimals: 1, min: 0, noValue: 'No recognitions', ...L.dashedLine(45), custom: {thresholdsStyle: {mode: 'dashed'}}}});
  const service = L.stat({id: 32, title: 'Recognizer service', gridPos: pos(16, y + 1, 8, 4),
    description: 'Debian collector GET /healthz of mw-receipt-recognition (paused when disabled); callers are the DEV and PROD command services. Detail on Agent & Receipts.',
    targets: [target('A', DS.gcp, monitoringUrl(customFilter('health', {component: 'recognizer'})), L.stateSelector(1), [col('time', 'Time', 'timestamp'), col('value', 'Service')], {format: 'timeseries'})],
    defaults: {mappings: L.stateMappings(L.STATE_TEXT, 'No report'), color: {mode: 'fixed', fixedColor: COLOR.unknown}},
    options: {reduceOptions: {calcs: ['last'], fields: '', values: false}, ...L.SINGLE_VALUE}});
  service.links = [{targetBlank: false, title: 'Agent & Receipts', url: '/d/mw-agent'}];
  // READ-1: the provider and model id is long text, so it has its own tile at the text-tile size.
  const model = L.modelTile({id: 33, title: 'Recognizer model', gridPos: pos(16, y + 5, 8, RECOGNITION - 4), component: 'recognizer',
    description: 'The recognizer\'s configured provider and model from the Debian collector (worker_timing{recognizer} provider and model:<id> fields), e.g. Gemini · gemini-3.5-flash-lite; the provider alone when the model is not readable.'});
  return [header, outcomes, latency, service, model];
}

const RECOGNITION = 9;
// Recognition outcomes (warning codes of services/receipts/recognizer-rules.mjs) in words.
const OUTCOMES = {none: 'Clean', slip_not_confirmed: 'Slip not confirmed', amount_unreadable: 'Amount unreadable', non_thb: 'Not THB',
  amount_fractional: 'Amount has satang', reference_unreadable: 'Reference unreadable', date_outside_window: 'Date outside window', time_unreadable: 'Time unreadable'};

// ENV-1: the environment switch is two links after the five page links (Grafana draws variables before links,
// so a visible variable would push the page links right on this page only). The env variable stays, hidden.
const ENV_LINKS = ['prod', 'dev'].map(env => ({asDropdown: false, icon: 'bolt', includeVars: false, keepTime: true, tags: [], targetBlank: false,
  title: env.toUpperCase(), tooltip: 'Show ' + env.toUpperCase() + ' (now showing ${env})', type: 'link', url: '/d/mw-pwa?var-env=' + env}));

function build() {
  return L.dashboard({uid: 'mw-pwa', description: 'PWA runtime by environment: hosting, API health, Cloud Run services, workers and the receipt recognition route. DEV is a switch, never aggregated with PROD.',
    time: {from: 'now-24h', to: 'now-2m'}, refresh: '2m',
    links: ENV_LINKS,
    templating: [{current: {text: 'prod', value: 'prod'}, hide: 2, includeAll: false, label: 'Environment', multi: false, name: 'env',
      options: [{selected: true, text: 'prod', value: 'prod'}, {selected: false, text: 'dev', value: 'dev'}], query: 'prod,dev', skipUrlSync: false, type: 'custom'}],
    panels: [hosting(), apiHealth(), errors(), ...SERVICES.flatMap(serviceRow), ...workers(), ...recognition()]});
}
module.exports = {build, SERVICES};
