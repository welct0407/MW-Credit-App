import test from 'node:test';import assert from 'node:assert/strict';
import {uiHostingPlan} from '../../scripts/promotion/ui-hosting-plan.mjs';
const base={release:'R054',scope:'frontend-only',site:'mw-credit-prod-737787224638',sourceCommit:'c07ada0e2cf6b73c46c47a049f1aa8976a53cc75',approvalReference:'owner13Oct',ciRequired:false};
for(const [name,patch]of Object.entries({target:{site:'mw-credit-app-dev-737787224638'},source:{sourceCommit:'0'.repeat(40)},scope:{scope:'database'},approval:{approvalReference:''},rollback:{rollback:{version:'sites/dev/versions/x',release:'sites/dev/releases/x'}}}))test('Reject '+name,async()=>{await assert.rejects(uiHostingPlan({...base,...patch},{artifactRoot:'unused',sourceRoot:'unused'}));});
