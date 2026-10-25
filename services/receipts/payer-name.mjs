// R095 payer (slip sender) name normalization, comparison and payer lines (revision 2). Parity module of
// integration-agent/src/mw_integration_agent/payer_name.py; both are driven by tests/fixtures/payer-name-cases.json.
// payerKey is a comparison key only; display is the stored and shown form (as printed, masks kept). A borrower's
// "Communication Name" holds up to 5 payer lines (line 1 the borrower); `?` in a line is exactly one unknown letter.

const MAX_BYTES = 200;
export const MAX_LINES = 5, MAX_LINES_BYTES = 1000;
/** Thai OCR look-alike letter pairs for `near` (symmetric); pinned in the fixture. */
export const LOOKALIKES = Object.freeze([['ภ', 'ก'], ['ณ', 'น'], ['ล', 'ส'], ['ด', 'ต'], ['บ', 'ป'], ['ช', 'ซ'], ['ข', 'ฃ'], ['ฎ', 'ฏ'], ['ถ', 'ภ'],
  ['ผ', 'พ'], ['ฝ', 'ฟ'], ['ค', 'ศ'], ['ท', 'ห'], ['อ', 'ฮ']].map(pair => Object.freeze(pair)));
const PAIRS = new Set(LOOKALIKES.flatMap(([a, b]) => [a + b, b + a]));
const INVISIBLE = /[\u200b-\u200d\u2060\ufeff]/g;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;
const SPACE = /\s+/g;
// One leading title, longest first. Thai titles may touch the name; English ones need a dot or a space.
const TITLE = /^(?:(?:นางสาว|นาง|นาย|คุณ|เด็กหญิง|เด็กชาย|นส)\.?\s*|(?:น\.ส|ด\.ช|ด\.ญ)\.?\s*|(?:mrs|mr|ms|miss)(?:\.\s*|\s+))/u;
const MASK_X = /x{2,}/g;
const MASK_RUN = /[*\u2022\u25cf\u00d7]+/g;
const THAI = /[\u0e00-\u0e7f]/u;
const LETTER = /\p{L}/u;
const ANY = '<any>', RUN = '<run>';

/** The name as printed: NFC, no control or zero-width characters, whitespace collapsed; '' when empty or over 200 bytes. */
export function display(text) {
  if (typeof text !== 'string' || !text.isWellFormed()) return '';
  const value = text.normalize('NFC').replace(INVISIBLE, '').replace(CONTROL, ' ').replace(SPACE, ' ').trim();
  return Buffer.byteLength(value, 'utf8') <= MAX_BYTES ? value : '';
}

export function payerKey(text) {
  let value = display(text).toLowerCase().normalize('NFC');
  const rest = value.replace(TITLE, '');
  if (rest.trim()) value = rest;
  value = value.replaceAll('.', '').replaceAll(',', '').replace(MASK_X, '*').replace(MASK_RUN, '*');
  const tokens = value.replace(SPACE, ' ').trim().split(' ');
  // A final surname of one or two letters without a mask is an abbreviation (banks print "ช." for "ช***").
  if (tokens.length >= 2 && !tokens.at(-1).includes('*') && letters(tokens.at(-1)) >= 1 && letters(tokens.at(-1)) <= 2) tokens[tokens.length - 1] += '*';
  return tokens.join(' ');
}

export const script = key => THAI.test(key) ? 'thai' : 'latin';
export const letters = key => [...key].filter(ch => LETTER.test(ch)).length;
/** At least three unmasked letters after normalization. */
export const readable = text => letters(payerKey(text)) >= 3;

// A mask stands for one or more characters: ANY (one character) then RUN (zero or more).
// `?` is exactly one unknown letter.
const glob = token => [...token].flatMap(ch => ch === '*' ? [ANY, RUN] : ch === '?' ? [ANY] : [ch]);

/** True when some name fits both tokens (each mask is one or more characters); without masks, equality. */
function compatible(a, b) {
  const p = glob(a), q = glob(b), seen = new Set();
  const fits = (i, j) => {
    const key = i + ':' + j;
    if (seen.has(key)) return false;
    seen.add(key);
    if (i === p.length && j === q.length) return true;
    if (i < p.length && p[i] === RUN && (fits(i + 1, j) || (j < q.length && fits(i, j + 1)))) return true;
    if (j < q.length && q[j] === RUN && (fits(i, j + 1) || (i < p.length && fits(i + 1, j)))) return true;
    return i < p.length && j < q.length && p[i] !== RUN && q[j] !== RUN
      && (p[i] === q[j] || p[i] === ANY || q[j] === ANY) && fits(i + 1, j + 1);
  };
  return fits(0, 0);
}

/** Given names of 4+ letters, same length, no mask, one differing position holding a look-alike pair. */
function near(a, b) {
  const x = [...a], y = [...b];
  if (a.includes('*') || b.includes('*') || x.length !== y.length || letters(a.replaceAll('?', '')) < 4 || letters(b.replaceAll('?', '')) < 4) return false;
  const diff = x.map((ch, i) => [ch, y[i]]).filter(([p, q]) => p !== q && p !== '?' && q !== '?');
  return diff.length === 1 && PAIRS.has(diff[0][0] + diff[0][1]);
}

/** 'match', 'near', 'mismatch' or 'unknown' (either side empty or under 3 letters, different scripts, or a missing surname). */
export function compare(stored, slip) {
  const a = payerKey(stored), b = payerKey(slip);
  if (letters(a) < 3 || letters(b) < 3 || script(a) !== script(b)) return 'unknown';
  const left = a.split(' '), right = b.split(' ');
  if (left.length !== right.length) {
    // A missing surname (one complete, unmasked given name of 3+ letters equal to the other's) is not evidence either
    // way: 'unknown', so it never resolves a borrower (C4/C5) and only proceeds where the borrower is already known.
    const [short, other] = left.length < right.length ? [left, right] : [right, left];
    const complete = short.length === 1 && !short[0].includes('*') && letters(short[0]) >= 3;
    return complete && short[0] === other[0] ? 'unknown' : 'mismatch';
  }
  if (left.every((token, index) => compatible(token, right[index]))) return 'match';
  if (left.slice(1).every((token, index) => compatible(token, right[index + 1])) && near(left[0], right[0])) return 'near';
  return 'mismatch';
}

/** The payer lines of a stored "Communication Name" (display form, empty lines dropped). */
export const lines = text => typeof text === 'string' ? text.split('\n').map(display).filter(Boolean) : [];
export const joined = values => values.join('\n');
/** The best comparison of a slip name with any line: 'match', 'near' or null. */
export function best(values, slip) {
  const results = new Set(values.map(line => compare(line, slip)));
  return results.has('match') ? 'match' : results.has('near') ? 'near' : null;
}
/** 1 to 5 lines, each a display-form name of 1 to 200 bytes, at most 1000 bytes joined. */
export const validLines = values => Array.isArray(values) && values.length >= 1 && values.length <= MAX_LINES
  && values.every(v => typeof v === 'string' && v !== '' && display(v) === v) && Buffer.byteLength(joined(values), 'utf8') <= MAX_LINES_BYTES;
/** The new lines after a posted slip, or null when nothing changes. Line order is kept (line 1 is the owner's). */
export function learn(values, slip) {
  const name = display(slip);
  if (!name || !readable(name)) return null;
  const result = [...values];
  const index = result.findIndex(line => compare(line, name) === 'match');
  if (index >= 0) {
    if (letters(payerKey(name)) <= letters(payerKey(result[index]))) return null;
    result[index] = name;
  } else {
    if (result.some(line => compare(line, name) === 'near') || result.length >= MAX_LINES) return null;
    result.push(name);
  }
  return validLines(result) ? result : null;
}
const NICK_PREFIX = /^(?:พี่\s*|p'\s*|pi\s+)/u;
/** A nickname message or borrower name for the forwarder hint: NFC, lower case, whitespace collapsed, one leading
 *  พี่ / p' / "pi " and an Instagram @ dropped. */
export function hintKey(text) {
  if (typeof text !== 'string') return '';
  const value = text.normalize('NFC').toLowerCase().replace(SPACE, ' ').trim().replace(NICK_PREFIX, '').trim();
  return value.startsWith('@') ? value.slice(1) : value;
}

/** Command field payerLines: null (no learning) or {before, after}: `before` the "Communication Name" the caller read
 *  (null or text), `after` the full new value, 1 to 5 display-form lines joined by \n, at most 1000 bytes, not `before`. */
export function validPayerLines(value) {
  if (value === null) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'after,before') return false;
  const { before, after } = value;
  if (!(before === null || (typeof before === 'string' && before.isWellFormed() && !before.includes('\0') && Buffer.byteLength(before, 'utf8') <= 65536))) return false;
  if (typeof after !== 'string' || !after.isWellFormed() || after === (before ?? '')) return false;
  return validLines(after.split('\n'));
}
