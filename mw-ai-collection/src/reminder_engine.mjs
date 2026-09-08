import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { Ledger } from './ledger.mjs';

const ms = value => {
  if (typeof value !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value)))
    throw new Error('Explicit timezone timestamp required');
  return Date.parse(value);
};
export function decide(state, config, now = new Date()) {
  if (state.hold) return {status:state.hold};
  if (state.pendingToken) return {status:'BLOCKED_PENDING'};
  if (state.sentCount >= config.maxTestReminders) return {status:'AWAITING_ACCEPTANCE'};
  if (now.getTime() >= ms(config.testExpiresAt)) return {status:'TEST_EXPIRED'};
  const due = state.promiseAt && !state.promiseReminded
    ? ms(state.promiseAt) + config.graceMinutes * 60000
    : ms(state.lastSentAt) + config.intervalMinutes * 60000;
  return {status:now.getTime() < due ? 'WAIT' : 'DUE', nextActionAt:new Date(due).toISOString(),
    kind:state.promiseAt && !state.promiseReminded ? 'PROMISE' : 'STANDARD'};
}
export function reminderMessage(name, kind) {
  return kind === 'PROMISE'
    ? `คุณ ${name} คะ ถึงเวลาที่นัดโอนแล้วนะคะ รบกวนส่งยอดด้วยค่ะ 😊`
    : `คุณ ${name} คะ ขออนุญาตเตือนส่งยอดนะคะ 😊`;
}
export class Reminders {
  constructor(path, config) {
    this.config = config;
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS reminder_sessions (id TEXT PRIMARY KEY, state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reminder_events (session_id TEXT, source_key TEXT, payload TEXT NOT NULL,
        PRIMARY KEY(session_id, source_key));
      CREATE TABLE IF NOT EXISTS reminder_sends (token TEXT PRIMARY KEY, session_id TEXT NOT NULL,
        status TEXT NOT NULL, message TEXT NOT NULL, reserved_at TEXT NOT NULL, sent_at TEXT, evidence TEXT);`);
  }
  close() { this.db.close(); }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  get() {
    const row = this.db.prepare('SELECT state FROM reminder_sessions WHERE id=?').get(this.config.reminders.sessionId);
    if (!row) throw new Error('Initialize reminder session first');
    return JSON.parse(row.state);
  }
  save(state) { this.db.prepare('UPDATE reminder_sessions SET state=? WHERE id=?').run(JSON.stringify(state), this.config.reminders.sessionId); }
  init(now = new Date()) {
    const c = this.config.reminders;
    if (!['Asia/Bangkok','Asia/Singapore'].includes(c.timezone) || !Number.isInteger(c.graceMinutes) || c.graceMinutes < 0 ||
        c.intervalMinutes !== 120 || c.maxTestReminders !== 1 || ms(c.testExpiresAt) <= now.getTime())
      throw new Error('Confirmed timezone, grace, expiry and one-reminder test limit required');
    return this.transaction(() => {
      const original = this.db.prepare('SELECT * FROM initial_messages WHERE borrower_id=? AND collection_date=? AND status=\'SENT\'')
        .get(this.config.borrowerId,c.collectionDate);
      if (!original) throw new Error('Confirmed initial daily send required');
      const revision = this.db.prepare('SELECT sent_at FROM review_resends WHERE original_token=? AND status=\'SENT\' ORDER BY sent_at DESC LIMIT 1').get(original.token);
      const state = {lastSentAt:revision?.sent_at || original.sent_at, sentCount:0, promiseAt:null,
        promiseReminded:false, hold:null, pendingToken:null, lastObservedAt:null};
      this.db.prepare('INSERT OR IGNORE INTO reminder_sessions VALUES (?,?)').run(c.sessionId,JSON.stringify(state));
      return this.get();
    });
  }
  observe(input, now = new Date()) {
    const c = this.config;
    if (input.recipient !== c.recipient || input.conversationUrl !== c.reminders.conversationUrl || input.source !== 'instagram-live-ui' || input.reviewedThroughLatest !== true)
      throw new Error('Verified complete live Instagram review required');
    const age = now.getTime() - ms(input.observedAt);
    if (age < 0 || age > c.maxSnapshotAgeSeconds * 1000) throw new Error('Stale Instagram observation');
    return this.transaction(() => {
      const state = this.get();
      if (state.lastObservedAt && ms(input.observedAt) < ms(state.lastObservedAt)) throw new Error('Out-of-order observation');
      for (const event of input.events || []) {
        if (!event.sourceKey || !event.text || !['PROMISE','NO_PROMISE','RECEIPT','PAID_CLAIM','REVIEW'].includes(event.intent))
          throw new Error('Grounded source key, source text and valid intent required');
        if (this.db.prepare('SELECT 1 FROM reminder_events WHERE session_id=? AND source_key=?').get(c.reminders.sessionId,event.sourceKey)) continue;
        if (event.intent === 'PROMISE') {
          if (event.confidence !== 'high' || event.requiresReview !== false || !event.timeEvidence || event.timezone !== c.reminders.timezone)
            throw new Error('Unambiguous promise and time evidence required');
          ms(event.promiseAt);
          if (event.promiseAt.slice(0,10) !== c.reminders.collectionDate) state.hold = 'NEEDS_HUMAN_REVIEW';
          else { state.promiseAt = event.promiseAt; state.promiseReminded = false; }
        } else if (['RECEIPT','PAID_CLAIM','REVIEW'].includes(event.intent)) {
          state.hold = event.intent === 'RECEIPT' ? 'RECEIPT_REVIEW' : 'NEEDS_HUMAN_REVIEW';
        }
        this.db.prepare('INSERT INTO reminder_events VALUES (?,?,?)').run(c.reminders.sessionId,event.sourceKey,JSON.stringify(event));
      }
      state.lastObservedAt = input.observedAt;
      this.save(state);
      return {...state, decision:decide(state,c.reminders,now)};
    });
  }
  reserve(facts, now = new Date()) {
    const c = this.config;
    const validator = new Ledger(':memory:');
    let result;
    try { result = validator.reserve(c,facts,now); } finally { validator.close(); }
    if (facts.collectionDate !== c.reminders.collectionDate) throw new Error('Wrong test collection day');
    return this.transaction(() => {
      const state = this.get();
      if (result.status === 'SKIP_PAID') { state.hold = 'COLLECTION_COMPLETE'; this.save(state); return {status:state.hold}; }
      if (!state.lastObservedAt || now.getTime()-ms(state.lastObservedAt) > c.maxSnapshotAgeSeconds*1000)
        throw new Error('Review latest Instagram messages before reserving');
      const decision = decide(state,c.reminders,now);
      if (decision.status !== 'DUE') return decision;
      const token = randomUUID();
      const message = reminderMessage(c.borrowerName,decision.kind);
      this.db.prepare('INSERT INTO reminder_sends VALUES (?,?,\'PENDING\',?,?,NULL,NULL)').run(token,c.reminders.sessionId,message,now.toISOString());
      state.pendingToken = token;
      state.pendingKind = decision.kind;
      this.save(state);
      return {status:'READY',token,recipient:c.recipient,message};
    });
  }
  finish(token, evidence, unknown = false, now = new Date()) {
    if (!evidence?.trim()) throw new Error('Visible send evidence or uncertainty reason required');
    return this.transaction(() => {
      const state = this.get();
      if (state.pendingToken !== token) throw new Error('No matching pending reminder');
      const status = unknown ? 'UNKNOWN' : 'SENT';
      const result = this.db.prepare('UPDATE reminder_sends SET status=?,sent_at=?,evidence=? WHERE token=? AND status=\'PENDING\'')
        .run(status,unknown ? null : now.toISOString(),evidence,token);
      if (result.changes !== 1) throw new Error('Reminder already finalized');
      if (unknown) state.hold = 'NEEDS_HUMAN_REVIEW';
      else { state.lastSentAt = now.toISOString(); state.sentCount++; if (state.pendingKind === 'PROMISE') state.promiseReminded = true; }
      state.pendingToken = null;
      this.save(state);
      return {status,token};
    });
  }
}
