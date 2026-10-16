/**
 * Request budget inside the 15 s Cloud Run request timeout (APP-PAY-03).
 * Worst case: token verification about 2 s + connect 3 s + statement 8 s = 13 s < 15 s.
 * The post-commit wake runs after the response and is capped separately (wakeMs).
 */
export const BUDGET=Object.freeze({
  connectMs:3000,
  statementMs:Object.freeze({command:8000,reader:5000}),
  queryMs:Object.freeze({command:9000,reader:7000}),
  lockMs:3000,
  httpRequestTimeoutMs:14000,
  headersTimeoutMs:10000,
  wakeMs:1500,
});
/** SET LOCAL text for a transaction statement timeout. */
export const statementTimeoutSql=role=>`SET LOCAL statement_timeout='${BUDGET.statementMs[role]}ms'`;
export const lockTimeoutSql=`SET LOCAL lock_timeout='${BUDGET.lockMs}ms'`;
