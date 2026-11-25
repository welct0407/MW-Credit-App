/** UXR-COPY-01 #7: a stored bilingual value ("Other / อื่น ๆ", "Open / ยังไม่ปิดยอด") shows only the current language's half.
 * The split is at the last " / " whose left part has no Thai and whose right part has Thai ("Bank / Transfer Fee / ค่า…" keeps
 * "Bank / Transfer Fee"); any other text is returned unchanged. Presentation only: stored values are never changed. Use it for
 * expense categories, loan statuses and chat card values, never for names or loan keys. */
const THAI=/[\u0E00-\u0E7F]/;
export function bilingualHalf(value:string,thai:boolean):string{
 const at=value.lastIndexOf(' / ');if(at<0)return value;
 const left=value.slice(0,at).trim(),right=value.slice(at+3).trim();
 return !left||!right||THAI.test(left)||!THAI.test(right)?value:thai?right:left;
}
