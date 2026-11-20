/* Dashboard 3 · Agent & Receipts (mw-agent): Debian-backed, last 6 hours, refresh 1 m. */
'use strict';
const L = require('./lib.cjs');
const {DS, COLOR, col, target, pos, byName, byRef, AGE, steps, valueMap, monitoringUrl, customFilter, jq} = L;

const wt = component => monitoringUrl(customFilter('worker_timing', {component}));
const ops = (refId, component, fields) => target(refId, DS.gcp, wt(component), jq('ops-health.jq', {FIELDS: fields}), fields.map(f => col(f.label, f.label)));

/* AGENT-ROWS (owner review): the page is grouped into titled rows by component, and every tile title names
 * its component, so no tile is ambiguous. Panel ids are kept; rows 20-24 and tile 12 are new. R091: the Partner
 * conversation row (22, tiles 3, 4, 5 and 15) is gone with the Instagram conversation; the rows below moved up. */
// R166: the group chat summary row (25, tiles 26-33) after the recognizer; the workers timeline gains its lane (height 10).
// Echo's grid with the heights the READ-1 layout model needs at 32 px values (3 values h7, 2 values h5, 5 values h10).
// A state field (0 Down, 1 OK, 2 Degraded, 3 Paused, 4 Unknown on their colours): an override on that field alone, never the
// panel defaults, which Grafana 13.4 also applies to the panel's numeric fields.
const stateField = () => ({mappings: L.stateMappings(L.STATE_TEXT, 'No report'), color: {mode: 'fixed', fixedColor: COLOR.unknown}});
// R177: the receipt first-time-right chart and tile (34, 35) below the pipeline tiles; the later rows move down by 9.
const ROW = {pipeline: 0, recognizer: 25, groupChat: 37, workers: 61, connectivity: 72};

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
    reviews, ...firstTimeRight(y + 16)];
}

/* R177 item D (owner, 20 November 2026; Echo UX-R177-08..13): the daily first-time-right % with the counts behind it, read
 * live from the agent database (monitoring.receipt_ftr_daily_v1, agent migration V15) through the datasource
 * mw-agent-receipts. One row per Bangkok day of slip arrival; the function always returns the whole history (receipt
 * jobs start 21 September 2026) and the panels keep their own 180-day range, so the dashboard's 6 hours do not apply. */
const FTR_SOURCE = 'monitoring.receipt_ftr_daily_v1()';
const FTR_SERIES = [['auto_first_pass', 'Recorded automatically', COLOR.ok], ['after_review', 'Recorded after review', '#7FB77E'],
  ['manual_in_app', 'Recorded by hand in the app', COLOR.degraded], ['rejected_or_held', 'Rejected or still held', COLOR.unknown]];
const FTR_PERCENT = 'First-time right %';
const FTR_RULE = 'First-time right = slips recorded automatically on the first pass with no human action ÷ genuine incoming slips. Not counted: non-receipts, repeats of a slip already handled, our own outgoing transfers (also before R177).';
const ftrTarget = rawSql => ({refId: 'A', datasource: DS.agentReceipts, editorMode: 'code', format: 'table', rawQuery: true, rawSql});
function ftrDailySql() {
  return ["SELECT (day::timestamp AT TIME ZONE 'Asia/Bangkok') AS \"time\",",
    ...FTR_SERIES.map(([column, name]) => '  ' + column + ' AS "' + name + '",'),
    '  ftr_percent AS "' + FTR_PERCENT + '"',
    'FROM ' + FTR_SOURCE,
    'ORDER BY 1'].join('\n');
}
function ftrMonthSql() {
  return ['SELECT round(100.0 * sum(auto_first_pass) / nullif(sum(genuine), 0), 1) AS "First-time right",',
    '  sum(genuine) AS "Genuine slips"',
    'FROM ' + FTR_SOURCE,
    "WHERE day > (now() AT TIME ZONE 'Asia/Bangkok')::date - 30"].join('\n');
}
function firstTimeRight(y) {
  const chart = L.timeseries({id: 34, title: 'Receipts · daily first-time right', gridPos: pos(0, y, 16, 9),
    description: FTR_RULE + ' Bangkok days since 21 Sep 2026 (the last 180 days); ignores the dashboard time range. Bars per day of slip arrival: recorded automatically, recorded after review (a Reviewer approval or choice, a loan close, or automatic only after a recheck), recorded by hand in the app (the agent handed it over: manual, stale or expired) and rejected or still held; a slip still in progress counts once it settles. Line: the first-time right % on the right axis, a gap on a day without a genuine slip. Read live from ' + FTR_SOURCE + ' in the agent database through Grafana PDC.',
    targets: [ftrTarget(ftrDailySql())],
    defaults: {unit: 'short', decimals: 0, min: 0, noValue: 'No slips in range', custom: {drawStyle: 'bars', fillOpacity: 100, lineWidth: 1,
      stacking: {group: 'A', mode: 'normal'}, axisLabel: 'Slips', axisPlacement: 'left'}},
    overrides: [...FTR_SERIES.map(([, name, color]) => byName(name, {color: {mode: 'fixed', fixedColor: color}})),
      // UX-R177-09: the % is a line on its own 0-100 axis; it carries no legend total (a sum of daily % misleads).
      byName(FTR_PERCENT, {unit: 'percent', decimals: 0, min: 0, max: 100, color: {mode: 'fixed', fixedColor: COLOR.text},
        'custom.drawStyle': 'line', 'custom.stacking': {group: 'A', mode: 'none'}, 'custom.axisPlacement': 'right', 'custom.axisLabel': FTR_PERCENT,
        'custom.fillOpacity': 0, 'custom.lineWidth': 2, 'custom.showPoints': 'always', 'custom.pointSize': 5, 'custom.spanNulls': false,
        'custom.hideFrom': {legend: true, tooltip: false, viz: false}})],
    options: {legend: {calcs: ['sum'], displayMode: 'table', placement: 'bottom', showLegend: true}, tooltip: {hideZeros: false, mode: 'multi', sort: 'none'}},
    extra: {timeFrom: '180d', hideTimeOverride: false}});
  const month = L.stat({id: 35, title: 'Receipts · last 30 days', gridPos: pos(16, y, 8, 9),
    description: 'The last 30 Bangkok days, today included, pooled: slips recorded automatically on the first pass ÷ genuine incoming slips (not a mean of the daily %), and how many genuine slips that is. ' + FTR_RULE + ' No owner target, so no colour. Read live from ' + FTR_SOURCE + '.',
    targets: [ftrTarget(ftrMonthSql())],
    transformations: [{id: 'filterFieldsByName', options: {include: {names: ['First-time right', 'Genuine slips']}}}],
    defaults: {color: L.NEUTRAL, mappings: [L.nullMap('No slips')]},
    overrides: [byName('First-time right', {unit: 'percent', decimals: 1}), byName('Genuine slips', {decimals: 0})],
    options: {reduceOptions: {calcs: ['lastNotNull'], fields: '', values: false}}});
  return [chart, month];
}

function recognizer() {
  const y = ROW.recognizer;
  const service = L.stat({id: 6, title: 'Recognizer · service', gridPos: pos(0, y + 1, 8, 6),
    description: 'Debian collector GET /healthz of mw-receipt-recognition (Paused when disabled, grey after 6 minutes) and time since the service last started. Callers: the DEV and PROD command services.',
    targets: [
      target('A', DS.gcp, monitoringUrl(customFilter('health', {component: 'recognizer'})), L.stateSelector(1), [col('time', 'Time', 'timestamp'), col('value', 'Service')], {format: 'timeseries'}),
      ops('B', 'recognizer', [{key: 'restart_age_seconds', label: 'Running for'}])
    ],
    // R167 (Grafana 13.4): the state words sit on the Service field only; in the defaults they also turned a 0-4 s age into a state word.
    defaults: {mappings: [L.nullMap('No report')], color: L.NEUTRAL},
    overrides: [byName('Service', stateField()),
      byName('Running for', {unit: AGE.unit, decimals: AGE.decimals, mappings: [L.nullMap('No report')], color: {mode: 'fixed', fixedColor: COLOR.info}})],
    options: {reduceOptions: {calcs: ['last'], fields: L.namedFields(['Service', 'Running for']), values: false}}});
  const model = L.modelTile({id: 12, title: 'Recognizer · model', gridPos: pos(0, y + 7, 8, 5), component: 'recognizer',
    description: 'The recognizer\'s provider and model for the PROD caller\'s route (R142 per-caller routing: the mw-credit-app-command-prod entry\'s provider, else the global default) from the Debian collector (worker_timing{recognizer} provider and model:<id> fields), e.g. Claude · claude-opus-5-5; the provider alone when the model is not readable.'});
  const extractions = L.stat({id: 7, title: 'Recognizer · extractions 24 h', gridPos: pos(8, y + 1, 8, 8),
    description: 'Debian collector worker_timing{recognizer} from mw_agent audit records, read-only: extractions in 24 h by the PWA route and the Instagram cycle, valid forms, timeouts and unreadable amounts (both orange above 0). Outcome categories only.',
    targets: [ops('A', 'recognizer', [{key: 'extractions_24h', label: 'Extractions'}, {key: 'valid_24h', label: 'Valid'},
      {key: 'timeouts_24h', label: 'Timed out'}, {key: 'unreadable_24h', label: 'Unreadable'}])],
    defaults: {color: {mode: 'fixed', fixedColor: COLOR.info}, mappings: [L.nullMap('No report')]},
    // FINAL4-3: timeouts and unreadable amounts need attention (0 is the expectation): green at 0, orange above.
    overrides: ['Timed out', 'Unreadable'].map(name => byName(name, L.problemColor('orange')))});
  const time = L.timeseries({id: 8, title: 'Recognizer · extraction time', gridPos: pos(16, y + 1, 8, 11),
    description: 'Debian collector worker_timing{recognizer_call}: the newest extraction completed since each run, at its end time; red dashed line = the 25 s per-attempt bound.',
    targets: [target('A', DS.gcp, monitoringUrl(customFilter('worker_timing', {component: 'recognizer_call', field: 'seconds'})), L.numericSelector(),
      [col('time', 'Time', 'timestamp'), col('value', 'Extraction')], {format: 'timeseries'})],
    transformations: noValueRows('Extraction'),
    defaults: {unit: 's', decimals: 1, min: 0, noValue: 'No extractions in selected range', ...L.dashedLine(25), custom: {drawStyle: 'points', pointSize: 6, showPoints: 'always', thresholdsStyle: {mode: 'dashed'}}}});
  return [L.row({id: 21, title: 'Receipt recognizer · mw-receipt-recognition on Debian', gridPos: pos(0, y, 24, 1)}), service, model, extractions, time];
}

/* R166 (owner, 17 November 2026; Echo's grid): the group chat summary (mw-group-chat-summary, every 2 minutes) from the
 * Debian collector worker_timing{group_chat_summary} and health{group_chat_summary}. The collector sends counts as 0 and
 * durations as -1 when there is nothing to report, so a quiet day reads None (never a healthy-looking zero), and a missing
 * value is No report. Durations are ages in seconds. */
const GROUP_CHAT = 'group_chat_summary';
// The summariser's fixed error codes in words (a key ending in * is a prefix); an unknown code reads "Other error".
// UX-CSMON-10: at most 15 characters each, so the phrase fills one line of the tile and "+N · age" the second.
const GROUP_CHAT_ERRORS = {MODEL_TIMEOUT: 'Model timeout', MODEL_UNREACHABLE: 'Model offline', 'MODEL_HTTP_*': 'Model error',
  MODEL_REFUSAL: 'Model refused', MODEL_UNFINISHED: 'Reply cut off', MODEL_RESPONSE_INVALID: 'Bad model reply',
  MODEL_RESPONSE_TOO_LARGE: 'Reply too large', 'MODEL_OUTPUT_INVALID*': 'Bad summary', MODEL_CREDENTIAL_UNAVAILABLE: 'Model sign-in',
  MODEL_FEDERATION_CONFIG: 'Model setup', MODEL_ENV_CREDENTIAL: 'Model setup', GROUP_NOT_FOUND: 'Group not found',
  GROUP_PARTICIPANTS_INCOMPLETE: 'Members unclear', GROUP_TOO_MANY_SUBJECTS: 'Group too large', POST_REFUSED: 'Post refused',
  POST_UNKNOWN_BORROWER: 'Borrower gone', RECEIPT_API_OUTCOME_UNCERTAIN: 'Post uncertain', 'RECEIPT_API_NOT_SENT_*': 'Post not sent',
  GROUP_SUMMARY_FAILED: 'Internal error',
  // R172: the R171 Instagram codes (INSTAGRAM_HTTP_<status>[_<graph code>], INSTAGRAM_TIMEOUT, INSTAGRAM_UNREACHABLE) and the
  // conversation-list codes of the poll (POLL_*), which the summariser shares.
  'INSTAGRAM_HTTP_*': 'IG error', INSTAGRAM_TIMEOUT: 'IG timeout', INSTAGRAM_UNREACHABLE: 'IG offline',
  'POLL_*': 'Chat read error'};
// Echo (real Grafana 12.2.1): an empty Infinity frame draws empty axes; series-to-rows plus organize makes the time
// series show its noValue text on zero rows, and leaves a busy chart unchanged.
const noValueRows = name => [{id: 'seriesToRows', options: {}}, {id: 'organize', options: {excludeByName: {Metric: true}, renameByName: {Value: name}}}];
// A value mapping for the collector's "nothing" (0 for a count, -1 for a duration) plus No report for a missing value.
const none = (value, text, color) => [{type: 'value', options: {[String(value)]: {text, color, index: 0}}}, L.nullMap('No report')];
const gc = fields => fields.map(([key, label, signed]) => ({key, label, ...(signed ? {signed: true} : {})}));
const limits = (...pairs) => ({color: {mode: 'thresholds'}, thresholds: steps([null, COLOR.ok], ...pairs)});
const age = (limit, text, color) => ({unit: AGE.unit, decimals: AGE.decimals, ...L.ageColor(limit), mappings: none(-1, text, color)});
const count = (text = 'None', color = COLOR.info) => ({color: L.NEUTRAL, mappings: none(0, text, color)});
const failures = () => ({...L.problemColor('orange'), mappings: none(0, 'None', COLOR.ok)});

function groupChat() {
  const y = ROW.groupChat;
  const lastRun = L.stat({id: 26, title: 'Group chat · last run', gridPos: pos(0, y + 1, 8, 7),
    description: 'Debian collector health{group_chat_summary}: OK, Degraded when the oldest waiting group has waited over 20 minutes, Down when no run finished for 10 minutes (the timer runs every minute), Paused when group_chat_summary_enabled is off (blue, does not page), Unknown when the agent database is unreadable. Last run is the time since the newest run finished (orange from 6 minutes); Run took its duration (orange from 120 s, red from 150 s, the run budget). None: no run recorded yet.',
    targets: [
      target('A', DS.gcp, monitoringUrl(customFilter('health', {component: GROUP_CHAT})), L.stateSelector(1), [col('time', 'Time', 'timestamp'), col('value', 'State')], {format: 'timeseries'}),
      ops('B', GROUP_CHAT, gc([['last_run_age_seconds', 'Last run', true], ['last_run_seconds', 'Run took', true]]))
    ],
    // R167 (Grafana 13.4): the state words sit on the State field only; in the defaults they turned an idle run's
    // Run took of 0 s into "Down" (byName mappings did not replace them).
    defaults: {mappings: [L.nullMap('No report')], color: L.NEUTRAL},
    overrides: [byName('State', stateField()), byName('Last run', age(360, 'None', COLOR.unknown)),
      byName('Run took', {unit: 's', decimals: 0, ...limits([120, COLOR.degraded], [150, COLOR.down]), mappings: none(-1, 'None', COLOR.info)})],
    options: {reduceOptions: {calcs: ['last'], fields: L.namedFields(['State', 'Last run', 'Run took']), values: false}}});
  const waiting = L.stat({id: 27, title: 'Group chat · waiting', gridPos: pos(8, y + 1, 8, 7),
    description: 'Debian collector worker_timing{group_chat_summary} from runtime.group_chat_summary_state: groups with new messages waiting for a summary, and how long the oldest has waited (orange from 10 minutes, the target; the backlog alert pages after 20). None (green): nothing waiting, also while Paused.',
    targets: [ops('A', GROUP_CHAT, gc([['waiting', 'Waiting'], ['oldest_wait_seconds', 'Oldest wait', true]]))],
    defaults: {color: L.NEUTRAL, mappings: [L.nullMap('No report')]},
    overrides: [byName('Waiting', count('None', COLOR.ok)), byName('Oldest wait', age(600, 'None', COLOR.ok))]});
  const errors = target('B', DS.gcp, wt(GROUP_CHAT), jq('group-chat-error.jq', {WORDS: GROUP_CHAT_ERRORS}), [col('Last error', 'Last error', 'string')]);
  const failuresTile = L.stat({id: 28, title: 'Group chat · failures', gridPos: pos(16, y + 1, 8, 7),
    description: 'In back-off: groups whose last summary run failed and that wait for their retry (10 minutes doubling to 6 hours); orange above 0. A group that keeps failing keeps its marker, so the backlog alert stays on until it is fixed (owner decision). Last error: the most frequent code of the newest run with a failure in 7 days, in words, +N for its other codes, and how long ago; None when there was none. The previous summary always stays.',
    targets: [ops('A', GROUP_CHAT, gc([['backoff_groups', 'In back-off']])), errors],
    defaults: {color: L.NEUTRAL, mappings: [L.nullMap('No report')]},
    overrides: [byName('In back-off', failures()),
      byName('Last error', {color: L.NEUTRAL, mappings: [{type: 'value', options: {None: {text: 'None', color: COLOR.ok, index: 0}}}, L.nullMap('No report')]})],
    // UX-CSMON-10: Last error is text, so the tile uses the text-tile size (READ-1: 20 px values, as the model tiles).
    options: {reduceOptions: {calcs: ['last'], fields: L.namedFields(['In back-off', 'Last error']), values: false}, text: L.TEXT_TILE}});
  const outcomes = L.stat({id: 29, title: 'Group chat · outcomes 24 h', gridPos: pos(0, y + 8, 8, 10),
    description: 'Summary runs in the last 24 hours, from the run records (runtime.job_runs): a new summary stored, unchanged (no new messages, or a newer summary from another group), cleared (nothing collection-relevant left, the card goes), postponed by the run budget, and failed (orange above 0). None: nothing of that kind in 24 hours.',
    targets: [ops('A', GROUP_CHAT, gc([['stored_24h', 'New summary'], ['unchanged_24h', 'Unchanged'], ['cleared_24h', 'Cleared'], ['deferred_24h', 'Postponed'], ['failed_24h', 'Failed']]))],
    defaults: {color: L.NEUTRAL, mappings: [L.nullMap('No report')]},
    overrides: [...['New summary', 'Unchanged', 'Cleared', 'Postponed'].map(name => byName(name, count())), byName('Failed', failures())]});
  const delay = L.stat({id: 30, title: 'Group chat · delay 24 h', gridPos: pos(8, y + 8, 8, 5),
    description: 'How long groups waited from their first new message to the summary, over the runs of the last 24 hours (median and longest); orange from 10 minutes, the target. None · 24 h: no summary of a waiting group in 24 hours.',
    targets: [ops('A', GROUP_CHAT, gc([['wait_median_seconds', 'Median', true], ['wait_max_seconds', 'Longest', true]]))],
    defaults: {color: L.NEUTRAL, mappings: [L.nullMap('No report')]},
    // UX-CSMON-11: a quiet day's None is neutral; grey is kept for No report only.
    overrides: ['Median', 'Longest'].map(name => byName(name, age(600, 'None · 24 h', COLOR.info)))});
  const model = L.modelTile({id: 31, title: 'Group chat · model', gridPos: pos(8, y + 13, 8, 5), component: GROUP_CHAT,
    description: 'The summariser\'s provider and model (Claude, group_chat_summary_model in the agent configuration) from the Debian collector worker_timing{group_chat_summary} provider and model:<id> fields.'});
  const refresh = L.stat({id: 32, title: 'Group chat · refresh 24 h', gridPos: pos(16, y + 8, 8, 10),
    description: 'Refresh taps on the Collection page served in the last 24 hours (R165): how many, the median and longest time from the tap to the agent\'s answer (orange from 4 minutes), how many took longer than the PWA\'s 6-minute wait (Timed out, orange above 0), and how many failed or found no group (Failed, orange above 0). None · 24 h: no tap in 24 hours.',
    targets: [ops('A', GROUP_CHAT, gc([['refresh_taps_24h', 'Taps'], ['refresh_median_seconds', 'Median wait', true], ['refresh_max_seconds', 'Longest wait', true],
      ['refresh_late_24h', 'Timed out'], ['refresh_failed_24h', 'Failed']]))],
    defaults: {color: L.NEUTRAL, mappings: [L.nullMap('No report')]},
    overrides: [byName('Taps', count('None · 24 h', COLOR.info)), ...['Median wait', 'Longest wait'].map(name => byName(name, age(240, 'None', COLOR.info))),
      byName('Timed out', failures()), byName('Failed', failures())]});
  const time = L.timeseries({id: 33, title: 'Group chat · model time', gridPos: pos(0, y + 18, 24, 6),
    description: 'Debian collector worker_timing{group_chat_summary_call}: the slowest summary model call that ended since the collector\'s previous run, at its end time (each call once); red dashed line = the 36 s model timeout.',
    targets: [target('A', DS.gcp, monitoringUrl(customFilter('worker_timing', {component: 'group_chat_summary_call', field: 'seconds'})), L.numericSelector(),
      [col('time', 'Time', 'timestamp'), col('value', 'Model call')], {format: 'timeseries'})],
    transformations: noValueRows('Model call'),
    defaults: {unit: 's', decimals: 1, min: 0, noValue: 'No summaries in selected range', ...L.dashedLine(36), custom: {drawStyle: 'points', pointSize: 6, showPoints: 'always', thresholdsStyle: {mode: 'dashed'}}}});
  return [L.row({id: 25, title: 'Group chat summary · mw-group-chat-summary on Debian', gridPos: pos(0, y, 24, 1)}),
    lastRun, waiting, failuresTile, outcomes, delay, model, refresh, time];
}

function workers() {
  const y = ROW.workers;
  return [L.row({id: 23, title: 'Agent workers and timers · Debian units', gridPos: pos(0, y, 24, 1)}),
    L.stateTimeline({id: 9, title: 'Agent workers and timers', gridPos: pos(0, y + 1, 24, 10),
      description: 'Debian collector state per unit (the Debian alert components keep their labels); a lane is empty after 6 minutes without a report. Daily jobs = cash statement plus email retry. Group chat (R166): Degraded is a backlog over 20 minutes, Down no run for 10 minutes, Paused the switch off; this lane does not page (the backlog alert does).',
      rows: [L.healthRow('Receipt cycle', 'receipts'), L.healthRow('IG polling', 'polling'), L.healthRow('Group chat', GROUP_CHAT),
        L.healthRow('Daily jobs', 'daily_jobs'), L.healthRow('Audit relay', 'audit_relay'), L.workerRow('Audit retention', 'audit_retention', 'result')]})];
}

function connectivity() {
  const y = ROW.connectivity;
  const version = L.stat({id: 13, title: 'Connectivity · code version', gridPos: pos(16, y + 13, 8, 3),
    description: 'Webhook receiver code version. Debian collector worker_timing{webhook_local, code_version_match}: 1 when the receiver\'s /ready code version equals the deployed commit.',
    targets: [target('A', DS.gcp, monitoringUrl(customFilter('worker_timing', {component: 'webhook_local', field: 'code_version_match'})), L.stateSelector(1),
      [col('time', 'Time', 'timestamp'), col('value', 'Code version')], {format: 'timeseries'})],
    defaults: {mappings: valueMap([[0, 'Mismatch', COLOR.down], [1, 'Matches', COLOR.ok], [4, 'No report', COLOR.unknown]], 'No report'), color: {mode: 'fixed', fixedColor: COLOR.unknown}},
    options: {reduceOptions: {calcs: ['last'], fields: '', values: false}, ...L.SINGLE_VALUE}});
  return [L.row({id: 24, title: 'Connectivity and providers', gridPos: pos(0, y, 24, 1)}),
    L.stateTimeline({id: 10, title: 'Connectivity · edge and data', gridPos: pos(0, y + 1, 16, 15),
      description: 'Public webhook check from the Singapore checker (empty after 12 minutes without a report) and the Debian collector\'s tunnel, Tailscale, local ingress, database path and Codex readiness (empty after 6 minutes).',
      rows: [L.webhookRow('Webhook · Singapore'), L.healthRow('Cloudflare tunnel', 'tunnel'), L.healthRow('Tailscale', 'tailscale_node'),
        L.healthRow('Local ingress', 'webhook_local'), L.healthRow('Database path', 'database'), L.healthRow('Codex ready', 'codex_ready')]}),
    // R143: three grid rows taller for the third (Anthropic) row at the standard 16/32 text; the code version tile and the edge timeline follow.
    L.providerStatus({id: 11, title: 'Providers · status', gridPos: pos(16, y + 1, 8, 12), anthropic: true}), version];
}

function build() {
  return L.dashboard({uid: 'mw-agent', description: 'Debian integration agent: receipt pipeline, receipt recognizer, group chat summary, units and connectivity.',
    time: {from: 'now-6h', to: 'now'}, refresh: '1m',
    panels: [...pipeline(), ...recognizer(), ...groupChat(), ...workers(), ...connectivity()]});
}
module.exports = {build};
