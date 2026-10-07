export function assertEnvironment(config) {
  if (config.environment !== "dev" || config.database !== "loan_manager_dev" || config.prefix !== "mw-credit-app/dev/") throw new Error("Unexpected development target");
  if (config.instance !== "clever-oasis-508610-n7:asia-southeast1:appsheet-pg-prod-20260914") throw new Error("Unexpected database instance");
  if (config.bucket !== "mw-payment-receipts-prod-508610-n7") throw new Error("Unexpected bucket");
}
