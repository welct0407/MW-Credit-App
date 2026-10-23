/** Numeric grounding of a chat reply (R088): every amount in the reply must come from this turn.
 *
 * Rule-for-rule port of integration-agent conversation_grounding.py (pure: no I/O, no clock other than the
 * elapsed-time measurement). The engine calls check() on every reply candidate, after the length check.
 *
 * A candidate is a money amount or a rate in any written form: ฿12,345, -฿1,500, 9,999฿, THB 9,999, 12,345 บาท,
 * 9,999 บ., baht, a k/K/M/พัน/หมื่น/แสน/ล้าน multiplier (฿9k, 1.2 ล้านบาท), space-grouped thousands (9 999 baht),
 * with /day, /วัน or ต่อวัน for a rate; or a percent (598.3%, ร้อยละ 16.2). Money is found first, so a date, year
 * or ID exemption never swallows an amount. In the rest of the text dates (with a day number), times, years, list
 * numbering, long IDs and plain counts are blanked and never checked. A candidate is grounded when, by absolute
 * value, it is
 *   1. in G: a number observed this turn (any observation value, numeric strings and short strings included,
 *      metadata keys skipped) or written in the partner's own message;
 *   2. a ± b with a in G' (the first PAIR_CAP observed amounts) and b an observed amount;
 *   3. a derived total: per list of rows and numeric column, the column total, its prefix totals (in either row
 *      order) and its totals grouped by each key column; the sum of every loan_payoff amount; the sum of a
 *      sum_field totals;
 *   4. a subset sum of a column of at most SUBSET_MAX values;
 *   5. in a formula line (one with × or =): a × n for a in G' and n a count of 1..PRODUCT_MAX written in the
 *      same line, or the line's grounded rate × its day count;
 *   6. a ± d with a in G' and d a derived total (rule 3).
 * Counts (integer values, count-named columns) and numbers under POOL_MIN are observed but never an addend or a
 * factor; subset sums ground only directly. A rate never grounds itself. A percent is grounded when it is in G
 * (ratio columns are also added × 100) or equals round(100·a/b, 1) with b among the PERCENT_DIVISORS largest pool
 * values. Money matches exactly or by whole-baht rounding (a written decimal matches to two places); percents
 * match to one decimal. ฿0 is always accepted; signs are not checked (absolute values).
 *
 * Port notes: Python's Unicode \w and \b become [\p{L}\p{N}_] look-arounds (u flag); re.I on the money patterns
 * is spelled out per letter so that the M multiplier stays case-sensitive, as (?-i:M) does in Python. Decimal
 * arithmetic is exact (BigInt satang). A JavaScript number is an integer (a count, as Python's int) when it has no
 * fractional part. Digits are ASCII after the Thai-digit translation, as in every reply the corpus covers. */

export const MAX_ATTEMPTS=3;
export const LIMITS={G_CAP:20000,PAIR_CAP:400,SUBSET_MAX:12,PRODUCT_MAX:400,PERCENT_DIVISORS:60,SHORT_STRING:40,POOL_MIN:10};
export const META_KEYS=new Set(['as_of','observation','row_count','rows_count','offset','limit','total_matched',
 'complete','source','columns','planHash','sourceVersion','businessDate','chargeDate']);
const W='[\\p{L}\\p{N}_]';
export const RATIO_COLUMN=/ratio|rate|percent|pct|roi|share|yield/i;
// Counts (charges, loans, days, rows) are observed values but never addends or factors of an amount.
export const COUNT_COLUMN=/count|^n$|_n$|(^|[ _])(charges|loans|days|rows|repayments|payments|items)$|^active/i;

/** Exact decimal: coef × 10^exp (BigInt coefficient). */
export class Dec {
 constructor(coef,exp){this.coef=coef;this.exp=exp;}
 /** Decimal(text) for digit strings with optional fraction and exponent; null when not a finite number. */
 static parse(text){
  const m=/^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(String(text).trim());
  if(!m||(!m[2]&&!m[3]))return null;
  const fraction=m[3]??'',coef=BigInt((m[2]||'0')+fraction);
  return new Dec(m[1]==='-'?-coef:coef,Number(m[4]??0)-fraction.length);
 }
 /** Decimal(repr(float)) / Decimal(int). */
 static fromNumber(value){return Number.isFinite(value)?Dec.parse(String(value)):null;}
 get zero(){return this.coef===0n;}
 abs(){return new Dec(this.coef<0n?-this.coef:this.coef,this.exp);}
 mul(other){return new Dec(this.coef*other.coef,this.exp+other.exp);}
 add(other){const e=Math.min(this.exp,other.exp);return new Dec(this.coef*10n**BigInt(this.exp-e)+other.coef*10n**BigInt(other.exp-e),e);}
 /** Exact comparison of values. */
 eq(other){const e=Math.min(this.exp,other.exp);return this.coef*10n**BigInt(this.exp-e)===other.coef*10n**BigInt(other.exp-e);}
 integral(){if(this.exp>=0||this.coef===0n)return true;return this.coef%(10n**BigInt(-this.exp))===0n;}
 /** round(value × 10^k) half away from zero (ROUND_HALF_UP), signed BigInt.
  * @param {number} k @returns {bigint} */
 round(k){
  const e=this.exp+k;
  if(e>=0)return this.coef*10n**BigInt(e);
  const negative=this.coef<0n,magnitude=negative?-this.coef:this.coef,unit=10n**BigInt(-e);
  let q=magnitude/unit;if((magnitude%unit)*2n>=unit)q+=1n;
  return negative?-q:q;
 }
 toNumber(){return Number(this.toString());}
 /** Python str(Decimal). */
 toString(){
  const negative=this.coef<0n,digits=(negative?-this.coef:this.coef).toString(),left=this.exp+digits.length;
  const dot=this.exp<=0&&left>-6?left:1;
  let integer,fraction;
  if(dot<=0){integer='0';fraction='.'+'0'.repeat(-dot)+digits;}
  else if(dot>=digits.length){integer=digits+'0'.repeat(dot-digits.length);fraction='';}
  else{integer=digits.slice(0,dot);fraction='.'+digits.slice(dot);}
  const exponent=left===dot?'':'E'+(left-dot>=0?'+':'')+(left-dot);
  return (negative?'-':'')+integer+fraction+exponent;
 }
}
/** @param {bigint} v @returns {bigint} */
const absBig=v=>v<0n?-v:v;
const whole=d=>absBig(d.abs().round(0));
const cents=d=>absBig(d.abs().round(2));
const tenths=d=>absBig(d.abs().round(1));
/** A Decimal as a signed number of hundredths, rounded half up. */
const satang=d=>d.round(2);
const compare=(a,b)=>a<b?-1:a>b?1:0;

/**
 * Every decimal digit (\p{Nd}: Thai, fullwidth, Arabic-Indic, …) becomes ASCII and U+2212 becomes '-', so the ASCII
 * patterns below see what Python's Unicode \d (and Decimal) see. Unicode keeps each Nd run as 0-9 in order, so a
 * digit's value is its distance from the start of its run, modulo 10.
 */
const digitValues=new Map();
function digitValue(c){
 let value=digitValues.get(c);if(value!==undefined)return value;
 const code=/** @type {number} */(c.codePointAt(0));let run=0;
 while(run<60&&/\p{Nd}/u.test(String.fromCodePoint(code-run-1)))run++;
 value=String(run%10);digitValues.set(c,value);return value;
}
const translate=text=>text.replace(/[\p{Nd}−]/gu,c=>c==='−'?'-':c>='0'&&c<='9'?c:digitValue(c));
/** Python's own translation (Thai digits and U+2212 only): the text a rejection quotes. */
const translateThai=text=>text.replace(/[๐-๙−]/g,c=>c==='−'?'-':String(c.charCodeAt(0)-0x0e50));
/** Python str.splitlines(). */
export function splitlines(text){
 const parts=text.split(/\r\n|[\n\r\x0b\x0c\x1c\x1d\x1e\x85\u2028\u2029]/);
 if(parts.at(-1)==='')parts.pop();
 return parts;
}
const ci=word=>[...word].map(c=>/[a-z]/i.test(c)?`[${c.toLowerCase()}${c.toUpperCase()}]`:c===' '?' ':c).join('');
const NUMBER='\\d[\\d,]*(?:\\.\\d+)?';
const EN_MONTH='(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?';
const TH_MONTH='(?:ม\\.ค\\.|ก\\.พ\\.|มี\\.ค\\.|เม\\.ย\\.|พ\\.ค\\.|มิ\\.ย\\.|ก\\.ค\\.|ส\\.ค\\.|ก\\.ย\\.|ต\\.ค\\.|พ\\.ย\\.|ธ\\.ค\\.|'
 +'มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)';
const EXEMPT=[
 '(?<![\\d,.])\\d{4}-\\d{2}-\\d{2}(?:[T ]\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?(?:Z|[+-]\\d{2}:?\\d{2})?)?',   // ISO date/time
 '(?<![\\d,.])\\d{1,2}[-/ ]'+EN_MONTH+'(?![a-z])(?:[-/ ,]+\\d{2,4})?',                                    // 21-Oct-2026, 16-Sep
 '(?<![A-Za-z])'+EN_MONTH+' \\d{1,2}(?:st|nd|rd|th)?(?:,? \\d{4})?(?![\\d,.])',                           // Oct 21, 2026
 '(?<![\\d,.])\\d{1,2}\\s?[-/ ]?\\s?'+TH_MONTH+'(?:\\s?[-/ ]?\\s?\\d{2,4})?',                              // 21-ต.ค.-2569
 '(?<![\\d,.])\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?(?![\\d,.])',                                                 // 21/10, 21/10/2026
 '(?<![\\d,.])\\d{1,2}:\\d{2}(?::\\d{2})?(?:\\s?(?:น\\.|am|pm))?',                                          // 14:05
 '(?<![\\d,.])\\d{1,2}\\.\\d{2}\\s?น\\.',                                                                   // 14.05 น.
 '(?<![\\d,.])(?:199\\d|20\\d\\d|2100|25[3-9]\\d|26[0-3]\\d|264[0-3])(?![\\d,.%])',                        // years
 '^\\s*\\d{1,3}[.)]\\s',                                                                                   // list numbering
 '(?<![\\d,.])\\d{7,}(?![\\d,.])',                                                                         // IDs without separators
 '(?<![\\d,.])\\d[\\d,]*\\s*(?:characters?|chars?|ตัวอักษร|lines?|บรรทัด)(?!'+W+')',                        // character counts
].map(p=>new RegExp(p,'giu'));
// Money is matched before the exemptions run, on the whole line, so they only ever see non-money text.
const AMOUNT='\\d{1,3}(?:[, \\u00a0\\u202f]\\d{3})+(?!\\d)(?:\\.\\d+)?|\\d+(?:\\.\\d+)?';
const MULTIPLIER='(?:\\s?(?<mult>[kK](?![A-Za-z])|M(?![A-Za-z])|พัน|หมื่น|แสน|ล้าน))?';
const MULTIPLIERS={k:1000n,K:1000n,M:1000000n,'พัน':1000n,'หมื่น':10000n,'แสน':100000n,'ล้าน':1000000n};
const RATE=`(?<rate>\\s*(?:/\\s*(?:${ci('day')}|${ci('d')}|วัน)(?!${W})|ต่อวัน|${ci('per day')}|${ci('a day')}))?`;
export const MONEY=new RegExp(`(?<neg>-\\s?)?(?<![\\d,.])(?:฿|(?<![\\d,.] )${ci('thb')})\\s?(?<num>${AMOUNT})${MULTIPLIER}${RATE}`,'gu');
export const BAHT=new RegExp(`(?<neg>-\\s?)?(?<![\\d,.])(?<num>${AMOUNT})${MULTIPLIER}(?:฿|\\s*(?:บาท|บ\\.|${ci('baht')}|${ci('thb')}))${RATE}`,'gu');
const PERCENT=new RegExp(`(?<![\\d,.])(?<num>${NUMBER})\\s*%|ร้อยละ\\s*(?<num2>${NUMBER})`,'giu');
const DAYS=new RegExp(`[×x*]\\s*(?<n>\\d{1,3})\\s*(?:days?|d(?!${W})|วัน)`,'giu');
const FACTOR=/(?<![\d,.฿])\d{1,3}(?![\d,.%])/giu;
const FORMULA=/[×=]|\d\s*[x*]\s*\d/iu;
const NUMERIC_STRING=new RegExp(`^\\s*\\(?\\s*(?<neg>-)?\\s*[฿$]?\\s*(?<neg2>-)?\\s*(?<num>${NUMBER})\\s*(?:thb|บาท|baht)?\\s*\\)?\\s*$`,'iu');
const ANY_NUMBER=new RegExp(`(?<![\\p{L}\\p{N}_.])${NUMBER}`,'gu');

const number=text=>Dec.parse(text.replaceAll(',',''));
const isKey=name=>{const n=String(name);return n.startsWith('Ref ')||n.endsWith('_id')||n.endsWith('Row ID')||n.endsWith('Id')||n.endsWith('ID')||n==='id'||n==='key';};
const blank=(line,pattern)=>line.replace(pattern,m=>' '.repeat(m.length));
const plainObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const container=v=>v!==null&&typeof v==='object';
const isInt=v=>typeof v==='number'&&Number.isInteger(v);
const hasDigit=text=>/\p{Nd}/u.test(text);

/** [(position, shown, Dec value, class)] of the money and rate amounts in one normalised line, and the line with
 * them blanked. */
function moneyItems(line){
 const items=[];
 for(const pattern of [MONEY,BAHT]){
  for(const m of line.matchAll(pattern)){
   let value=number(m.groups.num.replace(/[   ]/g,''));
   if(value===null)continue;
   if(m.groups.mult)value=value.mul(new Dec(MULTIPLIERS[m.groups.mult],0));
   items.push([m.index,m[0].trim(),value,m.groups.rate!==undefined?'rate':'money']);
  }
  line=blank(line,pattern);
 }
 return [items,line];
}
/** The non-money remainder of a normalised line with dates, times, years, numbering and IDs blanked. */
function scrub(line){for(const pattern of EXEMPT)line=blank(line,pattern);return line;}

/** [shown text, Dec value, class, line index, formula line, day counts, rates, counts in line] per candidate. */
export function candidates(text){
 const found=[];
 splitlines(translateThai(text)).forEach((original,index)=>{
  // ASCII line for matching, plus where each of its characters starts in the quoted line (astral digits are 2 units).
  const starts=[];let line='';
  for(let at=0;at<original.length;){
   const c=String.fromCodePoint(/** @type {number} */(original.codePointAt(at))),ascii=translate(c);
   for(let unit=0;unit<ascii.length;unit++)starts.push(ascii.length===c.length?at+unit:at);
   line+=ascii;at+=c.length;
  }
  starts.push(original.length);
  let [items,rest]=moneyItems(line);
  rest=scrub(rest);
  const formula=FORMULA.test(line);
  const days=[...rest.matchAll(DAYS)].map(m=>Number(m.groups.n));
  const factors=[...new Set([...rest.matchAll(FACTOR)].map(m=>Number(m[0])).filter(n=>n>=1&&n<=LIMITS.PRODUCT_MAX))].sort((a,b)=>a-b);
  for(const m of rest.matchAll(PERCENT)){
   const value=number(m.groups.num??m.groups.num2);
   if(value!==null)items.push([m.index,m[0].trim(),value,'percent']);
  }
  // Quote the candidate as written (fullwidth, Arabic-Indic or other non-Thai digits kept), as Python does.
  items=items.map(item=>{const at=line.indexOf(item[1],item[0]);return at<0?item:[item[0],original.slice(starts[at],starts[at+item[1].length]),...item.slice(2)]});
  items=items.map((item,order)=>[item,order]).sort((a,b)=>a[0][0]-b[0][0]||a[1]-b[1]).map(([item])=>item.slice(1)); // reading order
  const rates=items.filter(([,,cls])=>cls==='rate').map(([,v])=>v);
  for(const [shown,value,cls] of items)found.push([shown,value,cls,index,formula,days,rates,factors]);
 });
 return found;
}

/** The grounding set of one turn: observed values G, derived totals D, subset sums S. Every amount is a BigInt
 * number of satang (hundredths), absolute value. */
export class Grounding {
 constructor(observations,instruction=''){
  this.order=[];this.values=new Set();this.derived=[];this.subsets=new Set();this.counts=new Set();
  this.memo=new Map();this.percents=new Set();this.truncated=false;
  for(const value of this.requestNumbers(instruction||''))this.add(value);
  const loanPayoffs=[];
  for(const observation of Object.values(observations??{})){
   this.walk(observation,null);
   if(plainObject(observation)){
    const calculation=observation.calculation;
    if(plainObject(calculation)){const amount=this.parse(calculation.amount);if(amount!==null)loanPayoffs.push(amount);}
    const totals=observation.totals;
    if(plainObject(totals))this.derive(Object.values(totals).map(v=>this.parse(v)).filter(v=>v!==null).reduce((a,b)=>a+b,0n));
   }
  }
  if(loanPayoffs.length)this.derive(loanPayoffs.reduce((a,b)=>a+b,0n));
  const minimum=BigInt(LIMITS.POOL_MIN*100);
  // G': the first PAIR_CAP observed amounts (no counts, nothing under POOL_MIN); a in a ± b and in a × n.
  this.pool=[...new Set(this.order)].filter(v=>v>=minimum&&!this.counts.has(v)).slice(0,LIMITS.PAIR_CAP);
  const derived=new Set(this.derived);
  this.sources={observed:this.values,total:derived,subset:this.subsets,pool:new Set(this.pool),
   sum:new Set([...this.values].filter(v=>v>=minimum&&!this.counts.has(v))),chain:new Set([...derived].filter(v=>v>=minimum))};
  this.cache=new Map();
  this.percentPool=[...new Set([...this.pool,...derived])].map(v=>Number(v)/100).sort((a,b)=>a-b);
  this.divisors=[...this.pool].sort((a,b)=>compare(b,a)).slice(0,LIMITS.PERCENT_DIVISORS).filter(v=>v).map(v=>Number(v)/100);
 }
 /** Whole-baht (side 0) or satang (side 1) keys of one source set, built on first use.
  * @returns {any} */
 keys(source,side){
  const name=source+side;
  if(!this.cache.has(name)){
   const values=this.sources[source];
   const keys=side?new Set(values):new Set([...values].map(v=>(v+50n)/100n));
   this.cache.set(name,source==='pool'?[...keys].sort(compare):keys);
  }
  return this.cache.get(name);
 }
 percentKeys(){
  if(!this.cache.has('percents'))this.cache.set('percents',new Set([...this.percents,...[...this.values].map(v=>(v+5n)/10n)]));
  return this.cache.get('percents');
 }
 get size(){return this.values.size+this.derived.length+this.subsets.size;}
 /** Amounts (multipliers applied) and plain numbers of a text, dates, times and years excluded. */
 requestNumbers(text){
  const values=[];
  for(const line of splitlines(translate(text))){
   const [items,rest]=moneyItems(line);
   for(const [, , value] of items)values.push(satang(value));
   for(const m of scrub(rest).matchAll(ANY_NUMBER)){const v=number(m[0]);if(v!==null)values.push(satang(v));}
  }
  return values;
 }
 parse(value){
  if(typeof value==='string'){
   const key='p:'+value;
   if(!this.memo.has(key))this.memo.set(key,Grounding.parseValue(value));
   return this.memo.get(key);
  }
  return Grounding.parseValue(value);
 }
 /** Numbers inside a short non-numeric string ("300 THB", "cycle 3 days"); dates and times excluded. */
 strings(value){
  if([...value].length>LIMITS.SHORT_STRING||!hasDigit(translate(value)))return [];
  const key='s:'+value;
  if(!this.memo.has(key))this.memo.set(key,this.requestNumbers(value));
  return this.memo.get(key);
 }
 static parseDecimal(value){
  if(typeof value==='boolean'||value===null||value===undefined)return null;
  if(typeof value==='number')return Dec.fromNumber(value);
  if(value instanceof Dec)return value;
  const m=typeof value==='string'?NUMERIC_STRING.exec(value):null;
  return m?number(m.groups.num):null;
 }
 /** Signed satang of a number or numeric string, else null. */
 static parseValue(value){
  if(typeof value==='boolean'||value===null||value===undefined)return null;
  if(typeof value==='number'){
   if(Number.isSafeInteger(value))return BigInt(value)*100n;
   const d=Dec.fromNumber(value);return d?satang(d):null;
  }
  if(value instanceof Dec)return satang(value);
  if(typeof value==='string'){
   const m=NUMERIC_STRING.exec(value);
   if(m){const parsed=number(m.groups.num);if(parsed!==null)return m.groups.neg||m.groups.neg2?-satang(parsed):satang(parsed);}
  }
  return null;
 }
 full(){if(this.size>=LIMITS.G_CAP){this.truncated=true;return true;}return false;}
 add(value){
  if(value===null||this.full())return;
  value=absBig(value);
  if(!this.values.has(value)){this.values.add(value);this.order.push(value);}
 }
 derive(value){if(value===null||this.full())return;this.derived.push(absBig(value));}
 walk(value,key){
  if(plainObject(value)){
   for(const [k,v] of Object.entries(value)){if(!META_KEYS.has(k))this.walk(v,k);}
   return;
  }
  if(Array.isArray(value)){
   if(value.length&&value.every(plainObject)){
    this.rows(value); // scalars of the rows are added there; nested values are walked
    for(const row of value)for(const [k,v] of Object.entries(row))if(container(v)&&!META_KEYS.has(k))this.walk(v,k);
    return;
   }
   for(const item of value)this.walk(item,key);
   return;
  }
  this.scalar(value,key);
 }
 scalar(value,key,count,ratio){
  const parsed=this.parse(value);
  if(parsed!==null){
   this.add(parsed);
   if(count!==undefined?count:(key!==null&&key!==undefined&&COUNT_COLUMN.test(String(key))))this.counts.add(absBig(parsed));
   else if(isInt(value))this.counts.add(absBig(parsed));
   if(ratio!==undefined?ratio:(key!==null&&key!==undefined&&RATIO_COLUMN.test(String(key)))){
    const exact=Grounding.parseDecimal(value); // unrounded: 0.162 is 16.2%
    if(exact!==null)this.percents.add(tenths(exact.mul(new Dec(100n,0))));
   }
   return parsed;
  }
  if(typeof value==='string'&&!(key!==null&&key!==undefined&&isKey(key)))for(const text of this.strings(value))this.add(text);
  return null;
 }
 /** Rule 3 (column, prefix and grouped totals) and rule 4 (subset sums) for one list of rows. */
 rows(rows){
  const columns=new Map(),kinds=new Map();
  for(const row of rows){
   for(const [k,v] of Object.entries(row)){
    if(META_KEYS.has(k)||container(v))continue;
    if(!kinds.has(k))kinds.set(k,[isKey(k),COUNT_COLUMN.test(k),RATIO_COLUMN.test(k)]);
    const [key,count,ratio]=kinds.get(k);
    const parsed=this.scalar(v,k,count,ratio);
    if(parsed!==null&&!(key||count||isInt(v))){if(!columns.has(k))columns.set(k,[]);columns.get(k).push([row,parsed]);}
   }
  }
  const keys=Object.keys(rows[0]??{}).filter(isKey);
  for(const entries of columns.values()){
   const values=entries.map(([,v])=>v);
   let running=0n;
   for(const v of values){running+=v;this.derive(running);} // prefix totals; the last is the total
   running=0n;
   for(const v of values.toReversed().slice(0,-1)){running+=v;this.derive(running);} // suffix totals
   for(const key of keys){
    const groups=new Map();
    for(const [row,v] of entries){const g=row[key]??null;groups.set(g,(groups.get(g)??0n)+v);}
    if(groups.size>1&&groups.size<entries.length)for(const total of groups.values())this.derive(total);
   }
   if(values.length>2&&values.length<=LIMITS.SUBSET_MAX){
    let sums=new Set([0n]);
    for(const v of values)sums=new Set([...sums,...[...sums].map(s=>s+v)]);
    for(const s of sums){
     if(this.subsets.size>=LIMITS.G_CAP){this.truncated=true;break;}
     this.subsets.add(absBig(s));
    }
   }
  }
 }
 /** The rule that grounds a money or rate candidate, or null. */
 money(value,formula,days,rates,cls='money',factors=[]){
  if(value.zero)return 'zero';
  const side=value.integral()?0:1; // a written decimal matches to two places
  const key=side?cents(value):whole(value);
  for(const rule of ['observed','total','subset'])if(this.keys(rule,side).has(key))return rule;   // rules 1, 3, 4
  for(const rule of ['sum','chain']){                                                             // rules 2 and 6
   const members=this.keys(rule,side);
   for(const a of this.keys('pool',side))if(members.has(key-a)||members.has(a-key))return rule;
  }
  if(formula){                                                                                    // rule 5
   for(const rate of cls!=='rate'?rates:[])
    if(days.some(n=>rate.abs().mul(new Dec(BigInt(n),0)).eq(value))&&this.money(rate,false,[],[],'rate'))return 'product';
   for(const a of this.keys('pool',side))
    if(a&&key%a===0n&&factors.includes(Number(key/a)))return 'product';
  }
  return null;
 }
 percent(value){
  const target=tenths(value);
  if(this.percentKeys().has(target))return 'observed';
  const low=(value.toNumber()-0.05)/100,high=(value.toNumber()+0.05)/100;
  for(const b of this.divisors){
   let start=0,end=this.percentPool.length;const bound=low*b;
   while(start<end){const mid=(start+end)>>1;if(this.percentPool[mid]<bound)start=mid+1;else end=mid;} // bisect_left
   for(let i=start;i<this.percentPool.length;i++){
    const a=this.percentPool[i];
    if(a>high*b)break;
    if(tenths(Dec.fromNumber(100*a/b))===target)return 'ratio';
   }
  }
  return null;
 }
}

/** Result for one reply against this turn's observations and the partner's message. */
export function check(message,observations,instruction=''){
 const started=performance.now();
 const found=candidates(message);
 const grounding=new Grounding(observations,instruction);
 const ungrounded=[],classes=[],rules={};
 for(const [shown,value,cls,,formula,days,rates,factors] of found){
  const rule=cls==='percent'?grounding.percent(value):grounding.money(value,formula,days,rates,cls,factors);
  if(rule)rules[rule]=(rules[rule]??0)+1;
  else if(!ungrounded.includes(shown)){ungrounded.push(shown);classes.push(cls);}
 }
 return {ok:!ungrounded.length,candidates:found.length,ungrounded,classes,groundingValues:grounding.size,truncated:grounding.truncated,
  elapsedMs:Math.round((performance.now()-started)*100)/100,rules};
}
/** The rejection fed back to the model (exact R088 text). */
export function rejection(result,attempt){
 return `UNGROUNDED_AMOUNTS: ${result.ungrounded.join(', ')} are not in this turn's observations. Remove `
  +`them, or re-check the data with a tool and quote the observed figure. Attempt ${attempt} of ${MAX_ATTEMPTS}.`;
}
