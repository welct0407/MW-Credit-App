/** R153 (V148): the borrower's Instagram group chat link ("Borrowers"."IG Group URL"). The same rule as the column check
 * borrowers_ig_group_url_check, pwa_submit_operation_v2 and the services (IG_GROUP_URL_PATTERN in
 * services/api/collection-read-contract.mjs): https only, instagram.com or www.instagram.com under /direct/, or ig.me, no
 * user info, space or fragment, at most 255 characters after the prefix. Opening it is left to the device (the Instagram
 * app where it takes the link, else the browser). */
export const IG_GROUP_URL_PATTERN=/^https:\/\/((www\.)?instagram\.com\/direct\/|ig\.me\/)[A-Za-z0-9._~%/?=&+-]{1,255}$/;
export const validIgGroupUrl=(value:unknown):value is string=>typeof value==='string'&&IG_GROUP_URL_PATTERN.test(value);
/** The form's value as the command sends it: trimmed, blank is null (no link), otherwise the link when it matches the rule.
 * undefined (a record read before V148) stays absent, so an edit never clears a link it could not show. */
export function igGroupUrlValue(value:unknown):{ok:true;value:string|null|undefined}|{ok:false}{
 if(value===undefined)return {ok:true,value:undefined};if(value===null)return {ok:true,value:null};
 const text=String(value).trim();if(!text)return {ok:true,value:null};
 return validIgGroupUrl(text)?{ok:true,value:text}:{ok:false};
}
/** R154 (V149): the group's invite link ("Borrowers"."IG Group Invite Link"), https://ig.me/j/... only. The same rule as the
 * column check borrowers_ig_group_invite_link_check, pwa_submit_operation_v2 and the services (IG_GROUP_INVITE_PATTERN in
 * services/api/collection-read-contract.mjs). On a phone it opens the group itself in the Instagram app (owner test of
 * 14 November 2026), which the instagram.com link does not. */
export const IG_GROUP_INVITE_PATTERN=/^https:\/\/ig\.me\/j\/[A-Za-z0-9._~%/?=&+-]{1,255}$/;
export const validIgGroupInviteLink=(value:unknown):value is string=>typeof value==='string'&&IG_GROUP_INVITE_PATTERN.test(value);
/** The invite link form value, as igGroupUrlValue: trimmed, blank is null, undefined (a record before V149) stays absent. */
export function igGroupInviteValue(value:unknown):{ok:true;value:string|null|undefined}|{ok:false}{
 if(value===undefined)return {ok:true,value:undefined};if(value===null)return {ok:true,value:null};
 const text=String(value).trim();if(!text)return {ok:true,value:null};
 return validIgGroupInviteLink(text)?{ok:true,value:text}:{ok:false};
}
/** R154 D4: which kind of device opens the chat. iPhone, iPad (also iPadOS's desktop user agent, told by its touch points)
 * and Android are phones; anything else is a computer. */
export type ChatDevice='phone'|'computer';
export function chatDevice(nav:{userAgent?:string;maxTouchPoints?:number}|undefined=typeof navigator==='undefined'?undefined:navigator):ChatDevice{
 const agent=nav?.userAgent??'';
 if(/iPhone|iPad|iPod|Android/i.test(agent))return 'phone';
 if(/Macintosh/.test(agent)&&(nav?.maxTouchPoints??0)>1)return 'phone';
 return 'computer';
}
/** R154 D4: the "Open chat" link for this device. A phone prefers an invite link (inviteUrl, else url when it is one), else
 * any valid link; a computer prefers the instagram.com link, else any valid link. Null when none is valid. */
export function chooseChatLink(links:{url?:unknown;inviteUrl?:unknown},device:ChatDevice):string|null{
 const invite=validIgGroupInviteLink(links.inviteUrl)?links.inviteUrl:null,url=validIgGroupUrl(links.url)?links.url:null;
 if(device==='phone')return invite??url;
 const web=url&&/^https:\/\/(www\.)?instagram\.com\//.test(url)?url:null;
 return web??url??invite;
}
/** R161 (owner, 15 November 2026): a borrower with AI collection enabled and no usable group link opens a direct message
 * instead, https://ig.me/m/<handle>, the handle from the borrower's Instagram Username (free text). The same rule as the
 * services (igDmUrl in services/api/collection-read-contract.mjs): trimmed, one leading @ dropped, a profile link
 * (https://(www.)instagram.com/<handle>[/][?...]) or a DM link (https://ig.me/m/<handle>[/]) reduced to its handle, which must
 * be 1-30 letters, digits, dots or underscores, not dots only; a handle taken from a link must not be an Instagram path.
 * Else null. */
export const IG_DM_PATTERN=/^https:\/\/ig\.me\/m\/[A-Za-z0-9._]{1,30}$/;
export const IG_HANDLE_PATTERN=/^[A-Za-z0-9._]{1,30}$/;
export const IG_RESERVED_PATHS=['direct','p','reel','reels','explore','accounts','stories','tv'];
export function igDmUrl(value:unknown):string|null{
 if(typeof value!=='string')return null;
 let handle=value.trim();
 if(handle.startsWith('@'))handle=handle.slice(1);
 const link=/^https:\/\/(?:www\.)?instagram\.com\/([^/?#]+)\/?(?:\?[^#]*)?$/.exec(handle)??/^https:\/\/ig\.me\/m\/([^/?#]+)\/?$/.exec(handle);
 if(link){handle=link[1];if(IG_RESERVED_PATHS.includes(handle.toLowerCase()))return null}
 // A handle of dots only ('.', '..') is a path, never an account.
 return IG_HANDLE_PATTERN.test(handle)&&!/^\.+$/.test(handle)?`https://ig.me/m/${handle}`:null;
}
export const validIgDmUrl=(value:unknown):value is string=>typeof value==='string'&&IG_DM_PATTERN.test(value);
/** R161 D2: the chat a button opens. A usable group link wins (chooseChatLink, unchanged); only without one, the direct
 * message link when it is a valid https://ig.me/m/ link. Null when neither. */
export type ChatTarget={kind:'group'|'dm';href:string};
export function chooseChat(links:{url?:unknown;inviteUrl?:unknown;dmUrl?:unknown},device:ChatDevice):ChatTarget|null{
 const group=chooseChatLink(links,device);
 if(group)return {kind:'group',href:group};
 return validIgDmUrl(links.dmUrl)?{kind:'dm',href:links.dmUrl}:null;
}
/** R161 D7: the button's purpose, by kind (the visible text above 480px in the Collection header is "Open chat" for both). */
export const chatPurpose=(kind:ChatTarget['kind'],thai:boolean)=>kind==='dm'?(thai?'เปิดแชทส่วนตัวใน Instagram':'Open Instagram direct message'):(thai?'เปิดแชทกลุ่มใน Instagram':'Open group chat in Instagram');
/** R161 (owner's change of 15 November 2026: no offline shape bump): a row's chat links. The server's fields on the row
 * (chatUrl, chatInviteUrl, chatDmUrl; the read service) when it carries any of them; otherwise the links derived from the
 * borrower's record held in the member's offline records bundle (heldChatLinks), or none. Never throws. */
export type ChatLinks={url?:unknown;inviteUrl?:unknown;dmUrl?:unknown};
export function heldChatLinks(record:unknown):ChatLinks|null{
 if(!record||typeof record!=='object')return null;
 const value=record as {igGroupUrl?:unknown;igGroupInviteLink?:unknown;aiCollectionEnabled?:unknown;instagramUsername?:unknown};
 return {url:value.igGroupUrl,inviteUrl:value.igGroupInviteLink,dmUrl:value.aiCollectionEnabled===true?igDmUrl(value.instagramUsername):null};
}
export function rowChatLinks(row:{chatUrl?:unknown;chatInviteUrl?:unknown;chatDmUrl?:unknown}|null|undefined,held?:ChatLinks|null):ChatLinks{
 if(row&&(row.chatUrl!=null||row.chatInviteUrl!=null||row.chatDmUrl!=null))return {url:row.chatUrl,inviteUrl:row.chatInviteUrl,dmUrl:row.chatDmUrl};
 return held??{};
}
/** id -> links for the held borrower detail records (the records bundle's borrowers); anything malformed is skipped. */
export function heldChatLinksMap(borrowers:unknown):ReadonlyMap<string,ChatLinks>{
 const map=new Map<string,ChatLinks>();
 if(Array.isArray(borrowers))for(const record of borrowers){const links=heldChatLinks(record);if(links&&typeof (record as {id?:unknown}).id==='string')map.set((record as {id:string}).id,links)}
 return map;
}
