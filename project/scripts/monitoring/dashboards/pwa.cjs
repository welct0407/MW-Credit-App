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
  const p = L.lift(L.PWA_PLATFORM, 3, {id: 1, gridPos: pos(0, 0, 8, 4), title: 'Hosting · ${env}'});
  for (const t of p.targets) t.url = t.url.replace('pwa_hosting_prod%22', 'pwa_hosting_${env}%22');
  if (!p.targets[0].url.includes('pwa_hosting_${env}')) throw Error('Hosting filter not parameterised');
  return p;
}

function apiHealth() {
  const q = (refId, name, component) => target(refId, DS.gcp, monitoringUrl(customFilter('health', {component})), L.stateSelector(1),
    [col('time', 'Time', 'timestamp'), col('value', name)], {format: 'timeseries'});
  return L.stat({id: 2, title: 'API health · reader and command', gridPos: pos(8, 0, 8, 4),
    description: 'Debian collector GET /health on the ${env} reader and command services (no credentials, 10 s), plus the authenticated native OLTP and OLAP probes that always target PROD. Grey after 6 minutes without a report.',
    targets: [q('A', 'Reader', 'pwa_api_reader_${env}'), q('B', 'Command', 'pwa_api_command_${env}'),
      q('C', 'Native OLTP · PROD', 'oltp'), q('D', 'Native OLAP · PROD', 'olap')],
    defaults: {mappings: L.stateMappings(L.STATE_TEXT, 'No report'), color: {mode: 'thresholds'}, thresholds: steps([null, COLOR.unknown])},
    overrides: ['A', 'B', 'C', 'D'].map((r, i) => byRef(r, {displayName: ['Reader', 'Command', 'Native OLTP · PROD', 'Native OLAP · PROD'][i]})),
    options: {reduceOptions: {calcs: ['last'], fields: '', values: false}, text: {titleSize: 11, valueSize: 18}}});
}

function errors() {
  const code = (refId, name, value) => target(refId, DS.gcp, monitoringUrl('metric.type = "' + L.LOG_METRIC + 'mw_api_result_codes_${env}" AND metric.labels.code = "' + value + '"',
    {aligner: 'ALIGN_SUM', period: CHART_PERIOD}), jq('sum-points.jq'), [col('value', name)]);
  const fivexx = target('D', DS.gcp, monitoringUrl('metric.type = "run.googleapis.com/request_count" AND resource.type = "cloud_run_revision" AND resource.labels.service_name = monitoring.regex.full_match("mw-credit-app-(read|command|notify|jobs)-${env}") AND metric.labels.response_code_class = "5xx"',
    {aligner: 'ALIGN_SUM', reducer: 'REDUCE_SUM', period: CHART_PERIOD}), jq('sum-points.jq'), [col('value', '5xx · all services')]);
  return L.stat({id: 3, title: 'Sign-in and request errors', gridPos: pos(16, 0, 8, 4),
    description: 'Counts over the selected range: log-based mw_api_result_codes_${env} by result code (from the services\' structured request log, no user identity) and Cloud Run 5xx responses across the four ${env} services. Counts only, no threshold.',
    targets: [code('A', '401 session_invalid', 'session_invalid'), code('B', '503 session_check_unavailable', 'session_check_unavailable'),
      code('C', '503 body_timeout', 'body_timeout'), fivexx],
    defaults: {color: {mode: 'fixed', fixedColor: COLOR.paused}, noValue: 'None logged'},
    options: {reduceOptions: {calcs: ['lastNotNull'], fields: '', values: false}, text: {titleSize: 11, valueSize: 18}}});
}

function serviceRow(s, index) {
  const y = 4 + index * 7, base = 10 + index, id = (base) * 10;
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
  const instances = L.timeseries({id: id + 3, title: 'Instances, CPU %, memory % · ' + s.label, gridPos: pos(16, y + 1, 8, 6),
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
  const y = 4 + SERVICES.length * 7;
  const header = L.row({id: 19, title: 'Workers', gridPos: pos(0, y, 24, 1)});
  const scheduler = L.stateTimeline({id: 20, title: 'Cloud Scheduler attempts', gridPos: pos(0, y + 1, 12, 6),
    description: 'Log-based mw_scheduler_attempts_${env} per 5 minutes: green only successful attempts, red any failed attempt (status not OK or HTTP not 2xx). Blank = no attempt in that 5 min; DEV jobs are paused.',
    noValue: 'No attempt',
    rows: [L.schedulerRow('notifications · every minute', '${env}', 'notifications'), L.schedulerRow('daily charges · 00:05', '${env}', 'daily-charges'),
      L.schedulerRow('recent analytics · hourly', '${env}', 'recent-analytics')]});
  const pushFields = [{key: 'pending', label: 'Pending'}, {key: 'oldest_pending_seconds', label: 'Oldest pending'},
    {key: 'delivered_24h', label: 'Delivered · 24 h'}, {key: 'failed_24h', label: 'Failed · 24 h'}];
  const push = L.stat({id: 21, title: 'Push delivery', gridPos: pos(12, y + 1, 6, 6),
    description: 'PROD only: worker_timing{pwa_notify} from monitoring.pwa_ops_health_v1(); pending counts pending and retry, failed counts dead and uncertain completed in 24 h. Oldest pending red above 900 s (the alert value).',
    targets: [target('A', DS.gcp, monitoringUrl(customFilter('worker_timing', {component: 'pwa_notify'})), prodOnly(jq('ops-health.jq', {FIELDS: pushFields})),
      pushFields.map(f => col(f.label, f.label)))],
    defaults: {color: {mode: 'fixed', fixedColor: COLOR.paused}, mappings: [L.nullMap('No report')], noValue: 'PROD only'},
    overrides: [byName('Oldest pending', {unit: AGE.unit, decimals: AGE.decimals, color: {mode: 'thresholds'}, thresholds: steps([null, COLOR.ok], [900, COLOR.down])}),
      byName('Failed · 24 h', {color: {mode: 'thresholds'}, thresholds: steps([null, COLOR.ok], [1, COLOR.degraded])})],
    options: {text: {titleSize: 11, valueSize: 18}}});
  const jobFields = [{key: 'daily_charges_age_seconds', label: 'Daily charges', state_key: 'daily_charges_state'},
    {key: 'recent_analytics_age_seconds', label: 'Recent analytics', state_key: 'recent_analytics_state'}];
  const jobs = L.stat({id: 22, title: 'Job freshness', gridPos: pos(18, y + 1, 6, 6),
    description: 'PROD only: time since each job last completed (pwa_job_runs via worker_timing{pwa_jobs}; overdue red at 90 000 s and 4 500 s, the alert values) and since the last notification dispatch (pwa_notify).',
    targets: [
      target('A', DS.gcp, monitoringUrl(customFilter('worker_timing', {component: 'pwa_jobs'})), prodOnly(jq('ops-health.jq', {FIELDS: jobFields})), jobFields.map(f => col(f.label, f.label))),
      target('B', DS.gcp, monitoringUrl(customFilter('worker_timing', {component: 'pwa_notify'})),
        prodOnly(jq('ops-health.jq', {FIELDS: [{key: 'last_dispatch_age_seconds', label: 'Notification dispatch'}]})), [col('Notification dispatch', 'Notification dispatch')])
    ],
    defaults: {unit: AGE.unit, decimals: AGE.decimals, color: {mode: 'thresholds'}, noValue: 'PROD only',
      mappings: valueMap([[-1, 'Failed', COLOR.down], [-2, 'Overdue', COLOR.down]], 'No report'), thresholds: steps([null, COLOR.ok])},
    overrides: [byName('Daily charges', {thresholds: steps([null, COLOR.ok], [90000, COLOR.down])}),
      byName('Recent analytics', {thresholds: steps([null, COLOR.ok], [4500, COLOR.down])})],
    options: {text: {titleSize: 11, valueSize: 18}}});
  return [header, scheduler, push, jobs];
}

function recognition() {
  const y = 4 + SERVICES.length * 7 + 7;
  const header = L.row({id: 29, title: 'Receipt recognition route · command service to Debian recognizer', gridPos: pos(0, y, 24, 1)});
  const outcomes = L.stat({id: 30, title: 'Recognitions', gridPos: pos(0, y + 1, 8, 5),
    description: 'Log-based mw_recognition_outcome_${env}: recognitions on the command service over the selected range, one value per warning (none = the form filled cleanly). Categories only; no slip content or amounts.',
    targets: [target('A', DS.gcp, monitoringUrl('metric.type = "' + L.LOG_METRIC + 'mw_recognition_outcome_${env}"', {aligner: 'ALIGN_SUM', period: CHART_PERIOD}),
      jq('sum-by-label.jq', {LABEL: 'warning'}), [col('Outcome', 'Outcome', 'string'), col('Count', 'Count')])],
    defaults: {color: {mode: 'fixed', fixedColor: COLOR.paused}, noValue: 'No recognitions'},
    options: {reduceOptions: {calcs: ['lastNotNull'], fields: '/^Count$/', values: true}, text: {titleSize: 11, valueSize: 18}}});
  const latency = L.timeseries({id: 31, title: 'Recognition route p95', gridPos: pos(8, y + 1, 8, 5),
    description: 'Log-based distribution mw_recognition_route_latency_${env} from the request latency of POST /receipts/{id}/recognition; red dashed line = the 45 s route budget (the PWA deadline is 60 s).',
    targets: [ts('A', monitoringUrl('metric.type = "' + L.LOG_METRIC + 'mw_recognition_route_latency_${env}"', {aligner: 'ALIGN_DELTA', reducer: 'REDUCE_PERCENTILE_95', period: CHART_PERIOD}), 'p95')],
    defaults: {unit: 's', decimals: 1, min: 0, noValue: 'No recognitions', ...L.dashedLine(45), custom: {thresholdsStyle: {mode: 'dashed'}}}});
  const service = L.stat({id: 32, title: 'Recognizer service', gridPos: pos(16, y + 1, 8, 5),
    description: 'Debian collector GET /healthz of mw-receipt-recognition (paused when disabled) and its configured provider; callers are the DEV and PROD command services. Detail on Agent & Receipts.',
    targets: [
      target('A', DS.gcp, monitoringUrl(customFilter('health', {component: 'recognizer'})), L.stateSelector(1), [col('time', 'Time', 'timestamp'), col('value', 'Service')], {format: 'timeseries'}),
      target('B', DS.gcp, monitoringUrl(customFilter('worker_timing', {component: 'recognizer'})), jq('ops-health.jq', {FIELDS: [{key: 'provider', label: 'Provider'}]}), [col('Provider', 'Provider')])
    ],
    defaults: {mappings: L.stateMappings(L.STATE_TEXT, 'No report'), thresholds: steps([null, COLOR.unknown])},
    overrides: [byRef('A', {displayName: 'Service'}),
      byName('Provider', {mappings: valueMap([[1, 'Gemini', COLOR.paused], [2, 'Codex', COLOR.purple]], 'No report')})],
    options: {reduceOptions: {calcs: ['last'], fields: '', values: false}, text: {titleSize: 11, valueSize: 18}}});
  service.links = [{targetBlank: false, title: 'Agent & Receipts', url: '/d/mw-agent'}];
  return [header, outcomes, latency, service];
}

function build() {
  return L.dashboard({uid: 'mw-pwa', description: 'PWA runtime by environment: hosting, API health, Cloud Run services, workers and the receipt recognition route. DEV is a switch, never aggregated with PROD.',
    time: {from: 'now-24h', to: 'now-2m'}, refresh: '2m',
    templating: [{current: {text: 'prod', value: 'prod'}, hide: 0, includeAll: false, label: 'Environment', multi: false, name: 'env',
      options: [{selected: true, text: 'prod', value: 'prod'}, {selected: false, text: 'dev', value: 'dev'}], query: 'prod,dev', skipUrlSync: false, type: 'custom'}],
    panels: [hosting(), apiHealth(), errors(), ...SERVICES.flatMap(serviceRow), ...workers(), ...recognition()]});
}
module.exports = {build, SERVICES};
