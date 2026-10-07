import test from "node:test";import assert from "node:assert/strict";import {assertEnvironment} from "../../services/api/guards.mjs";
const valid={environment:"dev",database:"loan_manager_dev",prefix:"mw-credit-app/dev/",instance:"clever-oasis-508610-n7:asia-southeast1:appsheet-pg-prod-20260914",bucket:"mw-payment-receipts-prod-508610-n7"};
test("accepts exact DEV dependencies",()=>assert.doesNotThrow(()=>assertEnvironment(valid)));
for(const [key,value] of Object.entries({database:"loan_manager_prod",prefix:"",instance:"other",bucket:"other",environment:"prod"}))test("rejects wrong "+key,()=>assert.throws(()=>assertEnvironment({...valid,[key]:value})));
