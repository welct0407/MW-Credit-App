/** R116: a Cash Ledger row's borrower counterparty in the viewer's language (Thai "Borrower Name", English "Description",
 * as the notification text picks them), falling back to the other language; null without a borrower or any name. */
export function borrowerNameFor(row:{borrowerName?:unknown;borrowerDescription?:unknown},thai:boolean):string|null{
 const pick=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim():null,th=pick(row.borrowerName),en=pick(row.borrowerDescription);
 return thai?th??en:en??th;
}
/** Both ends of a ledger row: the account label, or the borrower on the side without an account, else "—". */
export function ledgerEndpoints(row:any,thai:boolean):{from:string;to:string}{
 const borrower=row?.borrowerId?borrowerNameFor(row,thai):null,end=(label:unknown,account:unknown)=>typeof label==='string'&&label?label:account==null&&borrower?borrower:'—';
 return {from:end(row?.fromAccountLabel,row?.fromAccountId),to:end(row?.toAccountLabel,row?.toAccountId)};
}
