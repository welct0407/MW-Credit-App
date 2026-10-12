/** Recorded Borrower Name - TE display; never substitute an internal ID. */
export function borrowerLabel(name:unknown,description:unknown,fallback='—'){return name==null&&description==null?fallback:String(name??'')+' - '+String(description??'')}
