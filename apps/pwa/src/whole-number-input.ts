/** Whole-number text input: digits keyboard on phones, no browser spinner or step rounding, no autofill. */
export const wholeNumberProps={type:'text',inputMode:'numeric',autoComplete:'off'} as const;
/** Strip only commas and whitespace a person may paste or type; a dot stays so "1000.50" is rejected, never silently truncated. */
export const normalizeWhole=(text:string)=>text.replace(/[,\s]/g,'');
/** Canonical non-negative whole baht as the command API accepts it (no leading zeros, no decimals). */
export const isWhole=(text:string)=>/^(0|[1-9][0-9]*)$/.test(text);
/** Canonical whole baht that may be negative (charge interest corrections). */
export const isSignedWhole=(text:string)=>/^-?(0|[1-9][0-9]*)$/.test(text);
/** Server numeric text such as "1000.00" reads as "1000"; a real fraction ("1000.50") is kept. */
export const wholeText=(value:unknown)=>value==null?value as null|undefined:String(value).replace(/\.0+$/,'');
