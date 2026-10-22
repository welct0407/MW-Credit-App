/* READ-1 layout model: does every stat, bar gauge, table and timeline of a generated dashboard show its
 * text untruncated at 1440 px (Grafana's docked menu leaves about 1108 px of grid) and on a 390 px phone
 * (every panel full width, 358 px)? It follows Grafana's stat layout (VizRepeater rows for orientation
 * horizontal, BigValue wide layout when a cell is wider than 2.5 x its height: name left and wrapping, value
 * right; stacked otherwise; explicit text sizes are not auto-fitted) with conservative glyph widths. It is a
 * model, not a renderer: it catches overflow by arithmetic, a screenshot review still decides the look.
 * No dependencies. */
'use strict';

const GRID = {cellHeight: 30, margin: 8, header: 32, padding: 8};
const SCREENS = {desktop: 1108, phone: 358};
const GLYPH = {value: 0.6, title: 0.55};
const LINE = 1.2;

function panelWidth(w, screen) {
  if (screen === 'phone') return SCREENS.phone;
  const col = (SCREENS.desktop - 23 * GRID.margin) / 24;
  return w * col + (w - 1) * GRID.margin;
}
function contentBox(gridPos, screen) {
  const height = gridPos.h * GRID.cellHeight + (gridPos.h - 1) * GRID.margin;
  return {width: panelWidth(gridPos.w, screen) - 2 * GRID.padding, height: height - GRID.header - 2 * GRID.padding};
}
const textWidth = (text, size, kind) => String(text).length * size * GLYPH[kind];
// Lines needed for text that may wrap at spaces within `width` (a single word wider than the width never fits).
function lines(text, size, kind, width) {
  if (width <= 0) return Infinity;
  let count = 1, current = 0;
  for (const word of String(text).split(' ')) {
    const w = textWidth(word, size, kind);
    if (w > width) return Infinity;
    const next = current ? current + textWidth(' ', size, kind) + w : w;
    if (next > width) { count++; current = w; } else current = next;
  }
  return count;
}

const UNIT_SAMPLE = {s: '59.9 min', 'prefix:S$': 'S$1,234.56', percent: '100%', percentunit: '100%', 'time:HH:mm': '23:59', ms: '9.99 s', d: '7 day'};
function mappingTexts(mappings = []) {
  return mappings.flatMap(m => m.type === 'value' ? Object.values(m.options).map(o => o.text)
    : m.options && m.options.result ? [m.options.result.text] : []).filter(Boolean);
}
// A value may wrap at spaces onto two lines (a state word such as "Feed unreadable"), a text tile onto three.
// The longest text a field can show: its mapping words, its no-value text and a sample in its unit.
function valueSamples(panel, name, extraSamples) {
  if (extraSamples['*']) return extraSamples['*'];
  const d = panel.fieldConfig.defaults;
  const o = Object.fromEntries((panel.fieldConfig.overrides || []).filter(x => x.matcher.id === 'byName' && x.matcher.options === name)
    .flatMap(x => x.properties.map(p => [p.id, p.value])));
  const unit = o.unit || d.unit;
  const texts = [...mappingTexts(o.mappings || d.mappings), o.noValue || d.noValue, UNIT_SAMPLE[unit] || '1234', ...(extraSamples[name] || [])];
  return texts.filter(t => typeof t === 'string');
}

function cellFits(cell, {title, values, titleSize, valueSize, valueLines = 1}) {
  const pad = cell.height > 100 ? 12 : 8;
  const width = cell.width - 2 * pad, height = cell.height - 2 * pad;
  const wide = cell.width / cell.height > 2.5;
  const valueW = Math.max(...values.map(v => textWidth(v, valueSize, 'value')));
  const valueRows = Math.max(...values.map(v => lines(v, valueSize, 'value', wide && title ? width * 0.7 : width)));
  if (valueRows > valueLines) return 'value too wide (' + Math.round(valueW) + ' px in ' + Math.round(width) + ')';
  const valueH = valueRows * valueSize * LINE;
  if (!title) return valueH <= height ? null : 'value too tall';
  if (wide) {
    const valueBox = Math.min(valueW, width * 0.7);
    const titleRows = lines(title, titleSize, 'title', width - valueBox - 12);
    if (titleRows > 2) return 'name "' + title + '" needs ' + titleRows + ' lines';
    return Math.max(titleRows * titleSize * LINE, valueH) <= height ? null : 'row too short';
  }
  const titleRows = lines(title, titleSize, 'title', width);
  if (titleRows > 2) return 'name "' + title + '" needs ' + titleRows + ' lines';
  return titleRows * titleSize * LINE + valueH <= height ? null : 'cell too short (' + Math.round(height) + ' px)';
}

// Displayed stat fields: names after the panel's own filters (or the explicit `names` for dynamic panels).
function statFields(panel, names) {
  if (names) return names;
  const filter = (panel.transformations || []).filter(t => t.id === 'filterFieldsByName').pop();
  let fields = filter ? filter.options.include.names : (panel.targets || []).flatMap(t => (t.columns || []).filter(c => !/^timestamp/.test(c.type)).map(c => c.text));
  fields = fields.filter(n => n !== 'Time' && n !== 'Category');
  const regex = panel.options.reduceOptions && panel.options.reduceOptions.fields;
  if (regex && regex.startsWith('/')) fields = fields.filter(n => new RegExp(regex.slice(1, -1)).test(n));
  return fields;
}

function checkStat(panel, screen, {names, samples = {}} = {}) {
  const fields = statFields(panel, names);
  const n = Math.max(fields.length, 1);
  const box = contentBox(panel.gridPos, screen);
  const o = panel.options;
  const rowH = o.orientation === 'horizontal' || n === 1 ? (box.height + 8) / n - 8 : null;
  if (rowH == null) return ['orientation ' + o.orientation + ' with ' + n + ' values is not modelled'];
  const showName = o.textMode === 'value_and_name' || (o.textMode === 'auto' && n > 1);
  const textTile = o.text.valueSize < 32;
  return fields.map(name => cellFits({width: box.width, height: rowH}, {title: showName ? name : null, values: valueSamples(panel, name, samples),
    titleSize: o.text.titleSize, valueSize: o.text.valueSize, valueLines: textTile ? 3 : 2})).map((e, i) => e && fields[i] + ': ' + e).filter(Boolean)
    .concat(fields.length ? [] : [cellFits({width: box.width, height: box.height}, {title: null, values: valueSamples(panel, '', samples),
      titleSize: o.text.titleSize, valueSize: o.text.valueSize})].filter(Boolean));
}

function checkGauge(panel, screen) {
  const names = (panel.fieldConfig.overrides || []).map(x => (x.properties.find(p => p.id === 'displayName') || {}).value).filter(Boolean);
  const box = contentBox(panel.gridPos, screen);
  const rowH = (box.height + 8) / names.length - 8;
  const t = panel.options.text;
  const errors = [];
  if (Math.max(t.titleSize, t.valueSize) * LINE > rowH) errors.push('bar rows too short (' + Math.round(rowH) + ' px)');
  const nameW = Math.max(...names.map(n => textWidth(n, t.titleSize, 'title')));
  if (nameW + textWidth('99.9%', t.valueSize, 'value') + 60 > box.width) errors.push('names and values leave no bar');
  return errors;
}

const TABLE = {header: 42, row: {sm: 36, md: 42, lg: 48}};
function checkTable(panel, screen, rows) {
  const box = contentBox(panel.gridPos, screen);
  const need = TABLE.header + rows * TABLE.row[panel.options.cellHeight || 'sm'];
  return need <= box.height + 2 * GRID.padding ? [] : [rows + ' rows need ' + need + ' px, ' + Math.round(box.height + 2 * GRID.padding) + ' available'];
}

function checkTimeline(panel, screen) {
  const box = contentBox(panel.gridPos, screen);
  const rowH = (box.height - 26) / panel.targets.length;
  return rowH >= 22 ? [] : ['timeline lanes ' + Math.round(rowH) + ' px high'];
}

module.exports = {GRID, SCREENS, contentBox, checkStat, checkGauge, checkTable, checkTimeline, lines, textWidth};
