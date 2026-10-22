/* Dashboard 3 · Agent & Receipts (mw-agent): Debian-backed, last 6 hours, refresh 1 m. */
'use strict';
const L = require('./lib.cjs');
const {DS, COLOR, col, target, pos, byName, byRef, AGE, steps, valueMap, monitoringUrl, customFilter, jq} = L;

const wt = component => monitoringUrl(customFilter('worker_timing', {component}));
const ops = (refId, component, fields) => target(refId, DS.gcp, wt(component), jq('ops-health.jq', {FIELDS: fields}), fields.map(f => col(f.label, f.label)));

/* AGENT-ROWS (owner review): the page is grouped into titled rows by component, and every tile title names
 * its component, so no tile is ambiguous. Panel ids are kept; rows 20-24 and tiles 12 and 15 are new. */
const ROW = {pipeline: 0, recognizer: 16, conversation: 28, workers: 42, connectivity: 52};

// LIVE-12: one six-value stat built like Now 4 (same queries: group-scanning.jq and receipt-pipeline.jq per
// stage field), stage names per AGENT-2 shortened for the larger text; today's panel 108 beside it as panel 2.
function pipeline() {
  const y = ROW.pipeline;
  const reviews = L.stat({id: 14, title: 'Receipts · ingress reviews', gridPos: pos(0, y + 13, 8, 3),
    description: 'Debian receipt pipeline snapshot receipt_pipeline{ingress_review_open}: ingress items waiting for review; orange above 0.',
    targets: [target('A', DS.gcp, monitoringUrl(customFilter('receipt_pipeline')), L.receiptFields([['ingress_review_open', 'Open ingress reviews']]),
      [col('ingress_review_open', 'Open ingress reviews')])],
    defaults: {mappings: [L.nullMap('No report')], thresholds: steps([null, COLOR.ok], [1, COLOR.degraded])},
    options: {reduceOptions: {calcs: ['last'], fields: '', values: false}, ...L.SINGLE_VALUE}});
  return [L.row({id: 20, title: 'Receipt pipeline · Instagram to recorded payment', gridPos: pos(0, y, 24, 1)}),
    require('./now.cjs').stagesStat({id: 1, title: 'Receipt pipeline · stages', gridPos: pos(0, y + 1, 8, 12), scan: 'Group scan · last run',
      stages: [['pending_images', 'Extraction waiting', 'stalled'], ['unnotified_holds', 'Validation holds', 'red'],
        ['pending_reviews', 'Reviews waiting', 'overdue'], ['unconfirmed_postings', 'Posting unconfirmed', 'red'],
        ['failed_notifications', 'Notify failures', 'red']],
      description: 'Instagram to recorded payment, Debian receipt pipeline snapshot (receipt_pipeline) and IG scan timing (worker_timing polling): group scan last run, receipts waiting for extraction, validation holds, reviewer decisions waiting, unconfirmed payment postings and notification failures. Every stage is coloured by its health: group scan by the IG polling state (green OK, orange Degraded, red Down, blue Paused) with the last completion time (ICT); extraction waiting green unless the oldest waiting image is older than 10 minutes (orange, stalled); reviews waiting green unless a review is overdue (orange), waiting itself is normal work; holds, unconfirmed postings and notification failures green at 0, red above. Paused does not page. Unconfirmed postings need reconciliation, never a repeated Add.'}),
    L.lift(L.PERF, 108, {id: 2, gridPos: pos(8, y + 1, 16, 15), title: 'Receipts · queue over time'}),
    reviews];
}

function recognizer() {
  const y = ROW.recognizer;
  const service = L.stat({id: 6, title: 'Recognizer · service', gridPos: pos(0, y + 1, 8, 6),
    description: 'Debian collector GET /healthz of mw-receipt-recognition (Paused when disabled, grey after 6 minutes) and time since the service last started. Callers: the DEV and PROD command services.',
    targets: [
      target('A', DS.gcp, monitoringUrl(customFilter('health', {component: 'recognizer'})), L.stateSelector(1), [col('time', 'Time', 'timestamp'), col('value', 'Service')], {format: 'timeseries'}),
      ops('B', 'recognizer', [{key: 'restart_age_seconds', label: 'Running for'}])
    ],
    defaults: {mappings: L.stateMappings(L.STATE_TEXT, 'No report'), color: {mode: 'fixed', fixedColor: COLOR.unknown}},
    overrides: [byName('Running for', {unit: AGE.unit, decimals: AGE.decimals, mappings: [L.nullMap('No report')], color: {mode: 'fixed', fixedColor: COLOR.info}})],
    options: {reduceOptions: {calcs: ['last'], fields: L.namedFields(['Service', 'Running for']), values: false}}});
  const model = L.modelTile({id: 12, title: 'Recognizer · model', gridPos: pos(0, y + 7, 8, 5), component: 'recognizer',
    description: 'The recognizer\'s configured provider and model from the Debian collector (worker_timing{recognizer} provider and model:<id> fields), e.g. Gemini · gemini-3.5-flash-lite; the provider alone when the model is not readable.'});
  const extractions = L.stat({id: 7, title: 'Recognizer · extractions 24 h', gridPos: pos(8, y + 1, 8, 8),
    description: 'Debian collector worker_timing{recognizer} from mw_agent audit records, read-only: extractions in 24 h by the PWA route and the Instagram cycle, valid forms, timeouts (orange above 0) and unreadable amounts. Outcome categories only.',
    targets: [ops('A', 'recognizer', [{key: 'extractions_24h', label: 'Extractions'}, {key: 'valid_24h', label: 'Valid'},
      {key: 'timeouts_24h', label: 'Timed out'}, {key: 'unreadable_24h', label: 'Unreadable'}])],
    defaults: {color: {mode: 'fixed', fixedColor: COLOR.info}, mappings: [L.nullMap('No report')]},
    overrides: [byName('Timed out', L.problemColor('orange'))]});
  const time = L.timeseries({id: 8, title: 'Recognizer · extraction time', gridPos: pos(16, y + 1, 8, 11),
    description: 'Debian collector worker_timing{recognizer_call}: the newest extraction completed since each run, at its end time; red dashed line = the 25 s per-attempt bound.',
    targets: [target('A', DS.gcp, monitoringUrl(customFilter('worker_timing', {component: 'recognizer_call', field: 'seconds'})), L.numericSelector(),
      [col('time', 'Time', 'timestamp'), col('value', 'Extraction')], {format: 'timeseries'})],
    defaults: {unit: 's', decimals: 1, min: 0, noValue: 'No extractions in selected range', ...L.dashedLine(25), custom: {drawStyle: 'points', pointSize: 6, showPoints: 'always', thresholdsStyle: {mode: 'dashed'}}}});
  return [L.row({id: 21, title: 'Receipt recognizer · mw-receipt-recognition on Debian', gridPos: pos(0, y, 24, 1)}), service, model, extractions, time];
}

function conversation() {
  const y = ROW.conversation;
  const turns = L.stat({id: 3, title: 'Conversation · turns 24 h', gridPos: pos(0, y + 1, 8, 13),
    description: 'Debian collector worker_timing{conversation} from the agent runtime tables, read-only: Partner turns in 24 h (nonpartner messages excluded), Verified = turns whose answer was VERIFIED, Failed = failed, unknown-write or interrupted turns (delivered or not), median duration and rounds, and grounding rejections.',
    targets: [ops('A', 'conversation', [{key: 'turns_24h', label: 'Turns'}, {key: 'verified_24h', label: 'Verified'}, {key: 'failed_24h', label: 'Failed'},
      {key: 'median_turn_seconds', label: 'Median turn'}, {key: 'median_rounds', label: 'Median rounds'}, {key: 'grounding_rejections_24h', label: 'Grounding rejections'}])],
    defaults: {color: {mode: 'fixed', fixedColor: COLOR.info}, mappings: [L.nullMap('No report')]},
    overrides: [byName('Median turn', {unit: AGE.unit, decimals: AGE.decimals}),
      byName('Failed', L.problemColor('orange'))]});
  const providers = [[1, 'Gemini', 'blue'], [2, 'Codex', 'purple'], [3, 'Claude', 'yellow']];
  const duration = L.timeseries({id: 4, title: 'Conversation · turn duration', gridPos: pos(8, y + 1, 8, 13),
    description: 'Debian collector worker_timing{conversation_turn}: one bar per completed turn at its end time, height = capture to reply in seconds, one series per provider. At most one turn per 2-minute collector run is plotted.',
    targets: providers.map(([code, name], i) => target(String.fromCharCode(65 + i), DS.gcp, wt('conversation_turn'),
      jq('turn-points.jq', {VALUE: 'seconds', KEY: 'provider', CODE: String(code)}), [col('time', 'Time', 'timestamp'), col('value', name)], {format: 'timeseries'})),
    // FINAL2-7: one decimal, so axis ticks of whole minutes do not all read "2 mins".
    defaults: {unit: 's', decimals: 1, min: 0, noValue: 'No turns in selected range', custom: {drawStyle: 'bars', fillOpacity: 80, barAlignment: 0, lineWidth: 1}},
    overrides: providers.map(([, name, color]) => byName(name, {color: {fixedColor: color, mode: 'fixed'}}))});
  const loop = L.stat({id: 5, title: 'Conversation · loop health', gridPos: pos(16, y + 1, 8, 10),
    description: 'Debian collector worker_timing{conversation}: conversation poll age (orange above 600 s, the alert value) and state, the mw-conversation-wake path, the 15 s worker timer and the last Instagram send acceptance.',
    targets: [ops('A', 'conversation', [{key: 'poll_age_seconds', label: 'Poll age'}, {key: 'poll_state', label: 'Poll state'},
      {key: 'wake_path_active', label: 'Wake path'}, {key: 'timer_ok', label: 'Worker timer'}, {key: 'last_send_age_seconds', label: 'Last send'}])],
    defaults: {color: {mode: 'fixed', fixedColor: COLOR.info}, mappings: [L.nullMap('No report')]},
    overrides: [byName('Poll age', {unit: AGE.unit, decimals: AGE.decimals, ...L.ageColor(600)}),
      byName('Poll state', {mappings: L.stateMappings(L.STATE_TEXT, 'No report')}),
      byName('Wake path', {mappings: valueMap([[0, 'Inactive', COLOR.down], [1, 'Active', COLOR.ok]], 'No report')}),
      byName('Worker timer', {mappings: valueMap([[0, 'Failed', COLOR.down], [1, 'OK', COLOR.ok]], 'No report')}),
      byName('Last send', {unit: AGE.unit, decimals: AGE.decimals})]});
  const model = L.modelTile({id: 15, title: 'Conversation · model', gridPos: pos(16, y + 11, 8, 3), component: 'conversation',
    description: 'The Partner conversation\'s configured provider and model from the Debian collector (worker_timing{conversation} provider and model:<id> fields), e.g. Gemini · gemini-4-argon; the provider alone when the model is not readable.'});
  return [L.row({id: 22, title: 'Partner conversation · Instagram chat agent', gridPos: pos(0, y, 24, 1)}), turns, duration, loop, model];
}

function workers() {
  const y = ROW.workers;
  return [L.row({id: 23, title: 'Agent workers and timers · Debian units', gridPos: pos(0, y, 24, 1)}),
    L.stateTimeline({id: 9, title: 'Agent workers and timers', gridPos: pos(0, y + 1, 24, 9),
      description: 'Debian collector state per unit (the 12 Debian alert components keep their labels); a lane is empty after 6 minutes without a report. Daily jobs = cash statement plus email retry.',
      rows: [L.healthRow('Receipt cycle', 'receipts'), L.healthRow('Partner conversation', 'conversations'),
        L.workerRow('Conversation poll', 'conversation', 'poll_state'), L.healthRow('IG polling', 'polling'),
        L.healthRow('Daily jobs', 'daily_jobs'), L.healthRow('Audit relay', 'audit_relay'), L.workerRow('Audit retention', 'audit_retention', 'result')]})];
}

function connectivity() {
  const y = ROW.connectivity;
  const version = L.stat({id: 13, title: 'Connectivity · code version', gridPos: pos(16, y + 10, 8, 3),
    description: 'Webhook receiver code version. Debian collector worker_timing{webhook_local, code_version_match}: 1 when the receiver\'s /ready code version equals the deployed commit.',
    targets: [target('A', DS.gcp, monitoringUrl(customFilter('worker_timing', {component: 'webhook_local', field: 'code_version_match'})), L.stateSelector(1),
      [col('time', 'Time', 'timestamp'), col('value', 'Code version')], {format: 'timeseries'})],
    defaults: {mappings: valueMap([[0, 'Mismatch', COLOR.down], [1, 'Matches', COLOR.ok], [4, 'No report', COLOR.unknown]], 'No report'), color: {mode: 'fixed', fixedColor: COLOR.unknown}},
    options: {reduceOptions: {calcs: ['last'], fields: '', values: false}, ...L.SINGLE_VALUE}});
  return [L.row({id: 24, title: 'Connectivity and providers', gridPos: pos(0, y, 24, 1)}),
    L.stateTimeline({id: 10, title: 'Connectivity · edge and data', gridPos: pos(0, y + 1, 16, 12),
      description: 'Public webhook check from the Singapore checker (empty after 12 minutes without a report) and the Debian collector\'s tunnel, Tailscale, local ingress, database path and Codex readiness (empty after 6 minutes).',
      rows: [L.webhookRow('Webhook · Singapore'), L.healthRow('Cloudflare tunnel', 'tunnel'), L.healthRow('Tailscale', 'tailscale_node'),
        L.healthRow('Local ingress', 'webhook_local'), L.healthRow('Database path', 'database'), L.healthRow('Codex ready', 'codex_ready')]}),
    L.providerStatus({id: 11, title: 'Providers · status', gridPos: pos(16, y + 1, 8, 9)}), version];
}

function build() {
  return L.dashboard({uid: 'mw-agent', description: 'Debian integration agent: receipt pipeline, Partner conversation, receipt recognizer, units and connectivity.',
    time: {from: 'now-6h', to: 'now'}, refresh: '1m',
    panels: [...pipeline(), ...recognizer(), ...conversation(), ...workers(), ...connectivity()]});
}
module.exports = {build};
