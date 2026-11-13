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
