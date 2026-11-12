/** R146 group chat summary: which summary this device has already shown, per signed-in offline scope.
 * localStorage key mw-credit.chat-seen:<scope>, a map of borrower id to the lastMessageAt last rendered by the card.
 * Per device by design (a hint, not shared state). Every read and write is guarded: when storage cannot be read the
 * caller shows no list marks (never permanent marks). */
export const CHAT_SEEN_EVENT='mw-chat-seen';
export const CHAT_MARK_WINDOW_MS=72*3600*1000;
const key=(scope:string)=>'mw-credit.chat-seen:'+scope;
// Scopes whose write failed in this session (storage that reads but refuses writes, or is full): a mark could never be
// cleared there, so they are treated as unreadable (no marks) until the page is loaded again.
const unwritable=new Set<string>();
/** The seen map, or null when storage is blocked or its value is not a map (then no marks are shown). */
export function readChatSeen(scope:string):Record<string,string>|null{
 if(unwritable.has(scope))return null;
 try{
  const raw=localStorage.getItem(key(scope));if(raw===null)return {};
  const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))return null;
  return Object.fromEntries(Object.entries(value).filter((entry):entry is [string,string]=>typeof entry[1]==='string'));
 }catch{return null}
}
/** Records that the card rendered this version, and tells the list (same tab) so the mark clears without a reload. */
export function markChatSeen(scope:string,borrowerId:string,lastMessageAt:string,now=Date.now()):void{
 try{
  const seen=readChatSeen(scope);if(!seen||seen[borrowerId]===lastMessageAt)return;
  // Entries far outside the mark window cannot matter any more; dropping them keeps the map small.
  const kept=Object.fromEntries(Object.entries(seen).filter(([,at])=>{const time=Date.parse(at);return Number.isFinite(time)&&now-time<30*24*3600*1000}));
  kept[borrowerId]=lastMessageAt;
  try{localStorage.setItem(key(scope),JSON.stringify(kept))}catch{unwritable.add(scope)/* the list is told below and drops its marks */}
 }catch{return}
 try{window.dispatchEvent(new Event(CHAT_SEEN_EVENT))}catch{/* no listener can be told; the next render reads storage */}
}
/** The list mark: a summary whose last substantive message is within 72 hours and that this device has not shown. */
export function chatMarkShown(seen:Record<string,string>|null,borrowerId:string,chatSummaryAt:string|null|undefined,now:number):boolean{
 if(!seen||typeof chatSummaryAt!=='string')return false;
 const time=Date.parse(chatSummaryAt);
 return Number.isFinite(time)&&now-time<=CHAT_MARK_WINDOW_MS&&seen[borrowerId]!==chatSummaryAt;
}
/** User-perceived characters of a text: Intl.Segmenter where the browser has it; otherwise code points, with combining
 * marks, variation selectors and zero-width-joiner sequences kept with the character before them. `segmenter` is for tests. */
export function graphemes(text:string,segmenter:(new(locale?:string,options?:{granularity:'grapheme'})=>{segment(input:string):Iterable<{segment:string}>})|undefined=(Intl as any).Segmenter):string[]{
 if(typeof segmenter==='function'){try{return Array.from(new segmenter(undefined,{granularity:'grapheme'}).segment(text),part=>part.segment)}catch{/* fall through to the code-point rule */}}
 const parts:string[]=[];
 for(const point of Array.from(text)){
  const joined=parts.length>0&&(/^(?:\p{M}|\u200D|[\uFE00-\uFE0F])$/u.test(point)||parts[parts.length-1].endsWith('\u200D'));
  if(joined)parts[parts.length-1]+=point;else parts.push(point);
 }
 return parts;
}
/** UX-CHAT-06: where a list row's name is split so the chat mark stays glued to its end: [head, tail], head + tail is the
 * name unchanged. The tail is the last word; a last word longer than 16 characters keeps only its last 8, counted and
 * cut on grapheme boundaries (never between a Thai letter and its vowel or tone mark, or inside an emoji). */
export function splitNameForMark(name:string,segmenter?:Parameters<typeof graphemes>[1]):[string,string]{
 const space=name.trimEnd().lastIndexOf(' '),word=name.slice(space+1),parts=segmenter===undefined?graphemes(word):graphemes(word,segmenter);
 if(parts.length<=16)return [name.slice(0,space+1),word];
 const tail=parts.slice(-8).join('');
 return [name.slice(0,name.length-tail.length),tail];
}
