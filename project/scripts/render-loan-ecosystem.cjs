// Local-only QA using the official draw.io viewer and an existing Chromium.
// Usage: node scripts/render-loan-ecosystem.cjs VIEWER_JS CHROMIUM_PATH [OUTPUT_DIR]
// No upload, service authentication, Desktop installation or remote browser is used.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const [viewer, executablePath, output = 'outputs/loan-ecosystem-20261004'] = process.argv.slice(2);
if (!viewer || !executablePath) throw new Error('Pass official viewer JS and Chromium executable paths.');
const sourcePath = path.join(root, 'Documents/Loan_Business_Ecosystem.drawio');
const xml = fs.readFileSync(sourcePath, 'utf8');
const viewerSource = fs.readFileSync(viewer, 'utf8');
const out = path.resolve(root, output);
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const results = [];
  try {
    for (let index = 0; index < 3; index++) {
      const page = await browser.newPage({ viewport: { width: 2400, height: 1770 }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      // All assets are embedded. Deny external requests during rendering.
      await page.route('**/*', route => route.abort());
      await page.setContent('<!DOCTYPE html><html><head><style>html,body{margin:0;padding:0;background:#F7FAFD}#graph{position:relative;width:2400px;height:1770px;overflow:hidden}</style></head><body><div id="graph"></div></body></html>');
      await page.addScriptTag({ content: 'var mxLoadResources=false; var mxLoadStylesheets=false;' });
      await page.addScriptTag({ content: viewerSource });
      const result = await page.evaluate(({ xml, index }) => {
        const doc = mxUtils.parseXml(xml);
        if (doc.getElementsByTagName('parsererror').length) throw new Error('Invalid diagram XML');
        const diagrams = Array.from(doc.getElementsByTagName('diagram'));
        if (diagrams.length !== 3) throw new Error('Expected exactly three pages');
        const diagram = diagrams[index];
        const graph = new Graph(document.getElementById('graph'));
        graph.setEnabled(false);
        // mxCodec ID lookup must be page-local: each page has its own root/layer IDs.
        const modelDoc = mxUtils.parseXml(mxUtils.getXml(diagram.getElementsByTagName('mxGraphModel')[0]));
        new mxCodec(modelDoc).decode(modelDoc.documentElement, graph.getModel());
        graph.refresh();
        window.qaGraph = graph;
        const cells = Object.values(graph.getModel().cells);
        if (!cells.some(c => c.vertex) || !cells.some(c => c.edge)) throw new Error('Empty page decode');
        const dangling = cells.filter(c => c.edge && (!c.source || !c.target)).map(c => c.id);
        if (dangling.length) throw new Error(`Dangling edges: ${dangling}`);
        const bounds = graph.getGraphBounds();
        return { name: diagram.getAttribute('name'), cells: cells.length,
          vertices: cells.filter(c => c.vertex).length, edges: cells.filter(c => c.edge).length,
          bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } };
      }, { xml, index });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(Array.from(document.images).map(img => img.decode().catch(() => {})));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      const svg = await page.evaluate(xml => {
        const svg = window.qaGraph.getSvg('#F7FAFD', 1, 0);
        svg.setAttribute('content', xml);
        return mxUtils.getXml(svg);
      }, xml);
      fs.writeFileSync(path.join(out, `page-${index + 1}.svg`), svg);
      // Rasterize the finished export, avoiding transient live-view text positions.
      const raster = await browser.newPage({ viewport: { width: 2400, height: 1770 }, deviceScaleFactor: 1 });
      await raster.route('**/*', route => route.abort());
      await raster.setContent('<!DOCTYPE html><html><head><style>body{margin:0;background:#F7FAFD}</style></head><body>' + svg + '</body></html>');
      await raster.evaluate(async () => {
        await document.fonts.ready;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      result.headerBounds = await raster.locator('div').filter({ hasText: /^MW CREDIT$/ }).last().evaluate(element => element.getBoundingClientRect().toJSON());
      if (result.headerBounds.x < 40 || result.headerBounds.y < 20) throw new Error('Header layout did not settle');
      await raster.screenshot({ path: path.join(out, `page-${index + 1}.png`) });
      await raster.close();
      results.push({ page: index + 1, ...result, errors });
      if (errors.length) throw new Error(errors.join('\n'));
      await page.close();
    }
    fs.writeFileSync(path.join(out, 'validation.json'), JSON.stringify({
      renderer: 'Official draw.io viewer in local Chromium; all external requests blocked',
      chromium: browser.version(), sourceSha256: sha256(xml), viewerSha256: sha256(viewerSource), pages: results
    }, null, 2) + '\n');
    console.log(JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
