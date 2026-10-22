/* R089 dashboard builder: writes the five v1beta1 envelopes (mw-now, mw-pwa, mw-agent,
 * mw-infra, mw-cost) under infrastructure/grafana/dashboards/. Source only; publication is
 * the reviewed Grafana Terraform apply. No dependencies.
 *   node project/scripts/monitoring/build-dashboards.cjs           write the files
 *   node project/scripts/monitoring/build-dashboards.cjs --check   fail if a file differs */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const L = require('./dashboards/lib.cjs');

const MODULES = {
  'mw-now': require('./dashboards/now.cjs'),
  'mw-pwa': require('./dashboards/pwa.cjs'),
  'mw-agent': require('./dashboards/agent.cjs'),
  'mw-infra': require('./dashboards/infra.cjs'),
  'mw-cost': require('./dashboards/cost.cjs')
};

function buildAll() {
  return Object.fromEntries(L.DASHBOARD_UIDS.map(uid => [uid, MODULES[uid].build()]));
}
function outputPath(uid) {
  return path.join(L.DASHBOARD_DIR, uid + '.json');
}

module.exports = {buildAll, outputPath, MODULES};

if (require.main === module) {
  const check = process.argv.includes('--check');
  const built = buildAll();
  const stale = [];
  for (const [uid, d] of Object.entries(built)) {
    const text = L.serialize(d);
    const file = outputPath(uid);
    if (check) {
      if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) stale.push(path.relative(L.REPO_ROOT, file));
    } else {
      fs.writeFileSync(file, text);
    }
  }
  if (stale.length) {
    console.error('Generated dashboards differ from the builder: ' + stale.join(', '));
    process.exit(1);
  }
  console.log((check ? 'Checked ' : 'Wrote ') + Object.keys(built).map(uid => uid + '.json').join(', '));
}
