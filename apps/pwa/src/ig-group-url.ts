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
