/** R146 group chat summary: which summary this device has already shown, per signed-in offline scope.
 * localStorage key mw-credit.chat-seen:<scope>, a map of borrower id to the lastMessageAt last rendered by the card.
 * Every read and write is guarded: when storage cannot be read and the server sent no seen value the caller shows no list
 * marks (never permanent marks).
 * R149: the device value is the instant and offline cache; the user's own value from the server (the list item's
 * chatSeenAt, V147) is what agrees across that user's devices. A mark shows only for a summary newer than both.
 * chat-seen-sync.ts sends what this device showed. */
export const CHAT_SEEN_EVENT='mw-chat-seen';
export const CHAT_MARK_WINDOW_MS=72*3600*1000;
const key=(scope:string)=>'mw-credit.chat-seen:'+scope;
// Scopes whose write failed in this session (storage that reads but refuses writes, or is full): a mark could never be
// cleared there, so they are treated as unreadable (no marks) until the page is loaded again.
const unwritable=new Set<string>();
// R149: what this page has shown, per scope, kept in memory. It clears a mark at once where storage is blocked or refuses
// writes (there the server value decides, and it arrives only with the next sync).
const shown=new Map<string,Record<string,string>>();
/** Whether a stored value covers a summary version: by time; a value that is not a time only by being the same text. */
const reached=(value:unknown,version:string,time:number)=>{const at=typeof value==='string'?Date.parse(value):Number.NaN;return Number.isFinite(at)?at>=time:value===version};
/** What this page has shown in this session (a copy; empty for a scope that showed nothing). */
export function sessionChatSeen(scope:string):Record<string,string>{return {...shown.get(scope)}}
/** The seen map, or null when storage is blocked or its value is not a map (then no marks are shown). */
export function readChatSeen(scope:string):Record<string,string>|null{
 if(unwritable.has(scope))return null;
 try{
  const raw=localStorage.getItem(key(scope));if(raw===null)return {};
  const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))return null;
  return Object.fromEntries(Object.entries(value).filter((entry):entry is [string,string]=>typeof entry[1]==='string'));
 }catch{return null}
}
/** Records that the card rendered this version, and tells the list (same tab) so the mark clears without a reload.
 * Forward only: an older version than the one already recorded changes nothing. */
export function markChatSeen(scope:string,borrowerId:string,lastMessageAt:string,now=Date.now()):void{
 const time=Date.parse(lastMessageAt),memory=shown.get(scope)??{};
 let changed=!reached(memory[borrowerId],lastMessageAt,time);
 if(changed)shown.set(scope,{...memory,[borrowerId]:lastMessageAt});
 try{
  const seen=readChatSeen(scope);
  if(seen&&!reached(seen[borrowerId],lastMessageAt,time)){
   // Entries far outside the mark window cannot matter any more; dropping them keeps the map small.
   const kept=Object.fromEntries(Object.entries(seen).filter(([,at])=>{const entry=Date.parse(at);return Number.isFinite(entry)&&now-entry<30*24*3600*1000}));
   kept[borrowerId]=lastMessageAt;changed=true;
   try{localStorage.setItem(key(scope),JSON.stringify(kept))}catch{unwritable.add(scope)/* the list is told below and decides without the stored map */}
  }
 }catch{/* the session value above still clears the mark */}
 if(!changed)return;
 try{window.dispatchEvent(new Event(CHAT_SEEN_EVENT))}catch{/* no listener can be told; the next render reads storage */}
}
/** The list mark: a summary whose last substantive message is within 72 hours and is newer than everything this user is
 * known to have seen: the server's value for the user (chatSeenAt), this page (session) and this device (seen). Times are
 * compared, not texts. Storage unreadable (seen null): the server and session values decide; when the server sent no
 * value at all (chatSeenAt undefined: a reader or database without V147) there are no marks, as in R146. */
export function chatMarkShown(seen:Record<string,string>|null,borrowerId:string,chatSummaryAt:string|null|undefined,now:number,chatSeenAt?:string|null,session?:Record<string,string>):boolean{
 if(typeof chatSummaryAt!=='string')return false;
 const time=Date.parse(chatSummaryAt);
 if(!Number.isFinite(time)||now-time>CHAT_MARK_WINDOW_MS)return false;
 if(reached(chatSeenAt,chatSummaryAt,time)||reached(session?.[borrowerId],chatSummaryAt,time))return false;
 if(seen)return !reached(seen[borrowerId],chatSummaryAt,time);
 return chatSeenAt!==undefined;
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
