import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { collectionMessage } from './message_template.mjs';

// Browser operations remain in Codex's supported browser tool. This ledger
// reserves a single borrower/day BEFORE the browser sends anything.
export class Ledger {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS initial_messages (
        borrower_id TEXT NOT NULL, collection_date TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE, recipient TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('PENDING','SENT','UNKNOWN')),
        message TEXT NOT NULL, snapshot TEXT NOT NULL,
        reserved_at TEXT NOT NULL, sent_at TEXT, evidence TEXT,
        PRIMARY KEY(borrower_id, collection_date));`);
  }
  close() { this.db.close(); }
  reserve(config, facts, now = new Date(), paymentBlock = '') {
    if (config.testMode !== true || config.scheduledSendingEnabled !== false)
      throw new Error('Build 1 requires manual test mode');
    if (facts.appId !== config.appId || facts.borrowerId !== config.borrowerId ||
        facts.borrowerName !== config.borrowerName || facts.recipient !== config.recipient)
      throw new Error('App, borrower or recipient does not match the test allowlist');
    if (facts.source !== 'appsheet-live-ui' || facts.synced !== true)
      throw new Error('Fresh synced AppSheet UI evidence required');
    const age = now.getTime() - Date.parse(facts.observedAt);
    if (!Number.isFinite(age) || age < 0 || age > config.maxSnapshotAgeSeconds * 1000)
      throw new Error('Snapshot is stale or invalid');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(facts.collectionDate) ||
        facts.collectionDate !== facts.appToday)
      throw new Error('Collection date must match the observed AppSheet date');
    for (const key of ['todayRemaining', 'overdueRemaining', 'totalRemaining'])
      if (!Number.isSafeInteger(facts[key]) || facts[key] < 0)
        throw new Error('Amounts must be nonnegative whole baht');
    if (facts.todayRemaining + facts.overdueRemaining !== facts.totalRemaining)
      throw new Error('Amount buckets do not reconcile');
    if (facts.totalRemaining === 0) return { status: 'SKIP_PAID' };
    if (!Array.isArray(facts.chargeIds) || facts.chargeIds.length === 0 ||
        facts.chargeIds.some(id => typeof id !== 'string' || !id) ||
        new Set(facts.chargeIds).size !== facts.chargeIds.length)
      throw new Error('Distinct source charge IDs required');
    const message = collectionMessage(facts, paymentBlock);
    const token = randomUUID();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.db.prepare('SELECT status, token FROM initial_messages WHERE borrower_id=? AND collection_date=?')
        .get(facts.borrowerId, facts.collectionDate);
      if (existing) {
        this.db.exec('COMMIT');
        return { status: 'BLOCKED_DUPLICATE', previousStatus: existing.status, token: existing.token };
      }
      this.db.prepare(`INSERT INTO initial_messages
        (borrower_id,collection_date,token,recipient,status,message,snapshot,reserved_at)
        VALUES (?,?,?,?,'PENDING',?,?,?)`).run(facts.borrowerId, facts.collectionDate,
          token, config.recipient, message, JSON.stringify(facts), now.toISOString());
      this.db.exec('COMMIT');
      return { status: 'READY', token, recipient: config.recipient, message };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  confirm(token, evidence, now = new Date()) {
    if (typeof evidence !== 'string' || !evidence.trim()) throw new Error('Visible sent-message evidence required');
    const result = this.db.prepare(`UPDATE initial_messages SET status='SENT', sent_at=?, evidence=?
      WHERE token=? AND status='PENDING'`).run(now.toISOString(), evidence, token);
    if (result.changes !== 1) throw new Error('No pending reservation for this token');
    return { status: 'SENT', token };
  }
  unknown(token, reason) {
    if (typeof reason !== 'string' || !reason.trim()) throw new Error('Reason required');
    const result = this.db.prepare(`UPDATE initial_messages SET status='UNKNOWN', evidence=? WHERE token=? AND status='PENDING'`)
      .run(reason, token);
    if (result.changes !== 1) throw new Error('No pending reservation for this token');
    return { status: 'UNKNOWN', token };
  }
  list() { return this.db.prepare('SELECT * FROM initial_messages ORDER BY reserved_at').all(); }
}
