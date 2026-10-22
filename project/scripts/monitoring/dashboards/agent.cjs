/* Dashboard 3 · Agent & Receipts (mw-agent): Debian-backed, last 6 hours, refresh 1 m. */
'use strict';
const L = require('./lib.cjs');
const {DS, COLOR, col, target, pos, byName, byRef, AGE, steps, valueMap, monitoringUrl, customFilter, jq} = L;

const wt = component => monitoringUrl(customFilter('worker_timing', {component}));
const ops = (refId, component, fields) => target(refId, DS.gcp, wt(component), jq('ops-health.jq', {FIELDS: fields}), fields.map(f => col(f.label, f.label)));

// D6: today's receipt stage panels lifted unchanged (ids kept), re-gridded w4 h5; 108 below.
function stages() {
  const titles = [[101, 'Group scanning · last run'], [103, 'Extraction · waiting'], [104, 'Validation · holds'],
    [105, 'Reviewer decisions · waiting'], [106, 'Payment posting · unconfirmed'], [107, 'Notification failures']];
  // 101's data link opened the old Performance page; it now opens the IG polling lane (Workers and timers).
  return [...titles.map(([id, title], i) => L.lift(L.PERF, id, {id, gridPos: pos(i * 4, 0, 4, 5), title, linkTo: '/d/mw-agent?viewPanel=9'})),
    L.lift(L.PERF, 108, {id: 108, gridPos: pos(0, 5, 24, 6), title: 'Queue length over time'})];
}

function conversation() {
  const turns = L.stat({id: 3, title: 'Turns · 24 h', gridPos: pos(0, 11, 6, 6),
    description: 'Debian collector worker_timing{conversation} from the agent runtime tables, read-only: Partner turns completed in 24 h, how many verified or failed, median duration and rounds, and grounding rejections.',
    targets: [ops('A', 'conversation', [{key: 'turns_24h', label: 'Turns'}, {key: 'verified_24h', label: 'Verified'}, {key: 'failed_24h', label: 'Failed'},
      {key: 'median_turn_seconds', label: 'Median turn'}, {key: 'median_rounds', label: 'Median rounds'}, {key: 'grounding_rejections_24h', label: 'Grounding rejections'}])],
    defaults: {color: {mode: 'fixed', fixedColor: COLOR.paused}, mappings: [L.nullMap('No report')]},
    overrides: [byName('Median turn', {unit: AGE.unit, decimals: AGE.decimals}),
      byName('Failed', {color: {mode: 'thresholds'}, thresholds: steps([null, COLOR.ok], [1, COLOR.degraded])})],
    options: {text: {titleSize: 11, valueSize: 18}}});
  const providers = [[1, 'Gemini', 'blue'], [2, 'Codex', 'purple'], [3, 'Claude', 'yellow']];
  const duration = L.timeseries({id: 4, title: 'Turn duration · per turn', gridPos: pos(6, 11, 10, 6),
    description: 'Debian collector worker_timing{conversation_turn}: one bar per completed turn at its end time, height = capture to reply in seconds, one series per provider. At most one turn per 2-minute collector run is plotted.',
    targets: providers.map(([code, name], i) => target(String.fromCharCode(65 + i), DS.gcp, wt('conversation_turn'),
      jq('turn-points.jq', {VALUE: 'seconds', KEY: 'provider', CODE: String(code)}), [col('time', 'Time', 'timestamp'), col('value', name)], {format: 'timeseries'})),
    defaults: {unit: 's', min: 0, noValue: 'No turns', custom: {drawStyle: 'bars', fillOpacity: 80, barAlignment: 0, lineWidth: 1}},
    overrides: providers.map(([, name, color]) => byName(name, {color: {fixedColor: color, mode: 'fixed'}}))});
  const loop = L.stat({id: 5, title: 'Loop health', gridPos: pos(16, 11, 8, 6),
    description: 'Debian collector worker_timing{conversation}: conversation poll age (red above 600 s, the alert value) and state, the mw-conversation-wake path, the 15 s worker timer and the last Instagram send acceptance.',
    targets: [ops('A', 'conversation', [{key: 'poll_age_seconds', label: 'Poll age'}, {key: 'poll_state', label: 'Poll state'},
      {key: 'wake_path_active', label: 'Wake path'}, {key: 'timer_ok', label: 'Worker timer'}, {key: 'last_send_age_seconds', label: 'Last send'}])],
    defaults: {color: {mode: 'fixed', fixedColor: COLOR.paused}, mappings: [L.nullMap('No report')]},
    overrides: [byName('Poll age', {unit: AGE.unit, decimals: AGE.decimals, color: {mode: 'thresholds'}, thresholds: steps([null, COLOR.ok], [600, COLOR.down])}),
      byName('Poll state', {mappings: L.stateMappings(L.STATE_TEXT, 'No report')}),
      byName('Wake path', {mappings: valueMap([[0, 'Inactive', COLOR.down], [1, 'Active', COLOR.ok]], 'No report')}),
      byName('Worker timer', {mappings: valueMap([[0, 'Failed', COLOR.down], [1, 'OK', COLOR.ok]], 'No report')}),
      byName('Last send', {unit: AGE.unit, decimals: AGE.decimals})],
    options: {text: {titleSize: 11, valueSize: 18}}});
  return [turns, duration, loop];
}

function recognizer() {
  const service = L.stat({id: 6, title: 'Recognizer service', gridPos: pos(0, 17, 6, 5),
    description: 'Debian collector GET /healthz of mw-receipt-recognition (Paused when disabled, grey after 6 minutes), its configured provider and time since the service last started. Callers: the DEV and PROD command services.',
    targets: [
      target('A', DS.gcp, monitoringUrl(customFilter('health', {component: 'recognizer'})), L.stateSelector(1), [col('time', 'Time', 'timestamp'), col('value', 'Service')], {format: 'timeseries'}),
      ops('B', 'recognizer', [{key: 'provider', label: 'Provider'}, {key: 'restart_age_seconds', label: 'Running for'}])
    ],
    defaults: {mappings: L.stateMappings(L.STATE_TEXT, 'No report'), thresholds: steps([null, COLOR.unknown])},
    overrides: [byRef('A', {displayName: 'Service'}),
      byName('Provider', {mappings: valueMap([[1, 'Gemini', COLOR.paused], [2, 'Codex', COLOR.purple]], 'No report')}),
      byName('Running for', {unit: AGE.unit, decimals: AGE.decimals, mappings: [L.nullMap('No report')], color: {mode: 'fixed', fixedColor: COLOR.paused}})],
    options: {reduceOptions: {calcs: ['last'], fields: '', values: false}, text: {titleSize: 11, valueSize: 18}}});
  const extractions = L.stat({id: 7, title: 'Extractions · 24 h', gridPos: pos(6, 17, 9, 5),
    description: 'Debian collector worker_timing{recognizer} from mw_agent audit records, read-only: extractions in 24 h by the PWA route and the Instagram cycle, valid forms, timeouts and unreadable amounts. Outcome categories only.',
    targets: [ops('A', 'recognizer', [{key: 'extractions_24h', label: 'Extractions'}, {key: 'valid_24h', label: 'Valid'},
      {key: 'timeouts_24h', label: 'Timed out'}, {key: 'unreadable_24h', label: 'Unreadable'}])],
    defaults: {color: {mode: 'fixed', fixedColor: COLOR.paused}, mappings: [L.nullMap('No report')]},
    options: {text: {titleSize: 11, valueSize: 18}}});
  const time = L.timeseries({id: 8, title: 'Extraction time (s)', gridPos: pos(15, 17, 9, 5),
    description: 'Debian collector worker_timing{recognizer_call}: the newest extraction completed since each run, at its end time; red dashed line = the 25 s per-attempt bound.',
    targets: [target('A', DS.gcp, monitoringUrl(customFilter('worker_timing', {component: 'recognizer_call', field: 'seconds'})), L.numericSelector(),
      [col('time', 'Time', 'timestamp'), col('value', 'Extraction')], {format: 'timeseries'})],
    defaults: {unit: 's', decimals: 1, min: 0, noValue: 'No extractions', ...L.dashedLine(25), custom: {drawStyle: 'points', pointSize: 6, showPoints: 'always', thresholdsStyle: {mode: 'dashed'}}}});
  return [service, extractions, time];
}

function timelines() {
  const units = L.stateTimeline({id: 9, title: 'Workers and timers', gridPos: pos(0, 22, 12, 8),
    description: 'Debian collector state per unit (the 12 Debian alert components keep their labels); grey after 6 minutes without a report. Daily jobs = cash statement plus email retry.',
    rows: [L.healthRow('Receipt cycle', 'receipts'), L.healthRow('Partner conversation', 'conversations'),
      L.workerRow('Conversation poll', 'conversation', 'poll_state'), L.healthRow('IG polling', 'polling'),
      L.healthRow('Daily jobs', 'daily_jobs'), L.healthRow('Audit relay', 'audit_relay'), L.workerRow('Audit retention', 'audit_retention', 'result')]});
  const connectivity = L.stateTimeline({id: 10, title: 'Connectivity, data and providers', gridPos: pos(12, 22, 12, 8),
    description: 'Public webhook check from the Singapore checker (grey after 12 minutes) and the Debian collector\'s tunnel, Tailscale, local ingress, database path and Codex readiness (grey after 6 minutes).',
    rows: [L.webhookRow('Webhook · Singapore'), L.healthRow('Cloudflare tunnel', 'tunnel'), L.healthRow('Tailscale', 'tailscale_node'),
      L.healthRow('Local ingress', 'webhook_local'), L.healthRow('Database path', 'database'), L.healthRow('Codex ready', 'codex_ready')]});
  return [units, connectivity];
}

function details() {
  const version = L.stat({id: 13, title: 'Ingress code version', gridPos: pos(12, 30, 6, 3),
    description: 'Debian collector worker_timing{webhook_local, code_version_match}: 1 when the receiver\'s /ready code version equals the deployed commit.',
    targets: [target('A', DS.gcp, monitoringUrl(customFilter('worker_timing', {component: 'webhook_local', field: 'code_version_match'})), L.stateSelector(1),
      [col('time', 'Time', 'timestamp'), col('value', 'Code version')], {format: 'timeseries'})],
    defaults: {mappings: valueMap([[0, 'Mismatch', COLOR.down], [1, 'Matches', COLOR.ok], [4, 'No report', COLOR.unknown]], 'No report'), thresholds: steps([null, COLOR.unknown])},
    options: {reduceOptions: {calcs: ['last'], fields: '', values: false}, textMode: 'value'}});
  const reviews = L.stat({id: 14, title: 'Open ingress reviews', gridPos: pos(18, 30, 6, 3),
    description: 'Debian receipt pipeline snapshot receipt_pipeline{ingress_review_open}: ingress items waiting for review; orange above 0.',
    targets: [target('A', DS.gcp, monitoringUrl(customFilter('receipt_pipeline')), L.receiptFields([['ingress_review_open', 'Open ingress reviews']]),
      [col('ingress_review_open', 'Open ingress reviews')])],
    defaults: {mappings: [L.nullMap('No report')], thresholds: steps([null, COLOR.ok], [1, COLOR.degraded])},
    options: {reduceOptions: {calcs: ['last'], fields: '', values: false}, textMode: 'value'}});
  return [L.providerStatus({id: 11, gridPos: pos(0, 30, 12, 3)}), version, reviews];
}

function build() {
  return L.dashboard({uid: 'mw-agent', description: 'Debian integration agent: receipt pipeline, Partner conversation, receipt recognizer, units and connectivity.',
    time: {from: 'now-6h', to: 'now'}, refresh: '1m',
    panels: [...stages(), ...conversation(), ...recognizer(), ...timelines(), ...details()]});
}
module.exports = {build};
