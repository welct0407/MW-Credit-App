// Shared DEV/RC/PROD definitions. Delivery data, not app literals, selects environment recipients.
export function recipientFor(actor) {
  const id=`LOOKUP(LOWER(TRIM(${actor})), "Partners", "Login Email", "Row ID")`;
  return `SELECT(Partners[Email], AND(ISNOTBLANK([Email]), ISNOTBLANK(${id}), [Row ID] <> ${id}), TRUE)`;
}
export function commandActor(table) {
  if(!['Borrowers','Charges','Loans'].includes(table)) throw new Error('Unsupported command table');
  return `LOOKUP(CONCATENATE("r008:${table}|", LEN([_THISROW].[Row ID]), ":", [_THISROW].[Row ID], "|", [_THISROW].[Payment Request Token]), "Payments", "Row ID", "Created By")`;
}
export const routes=[
 ['Task for Send App Notification','Loans','[_THISROW].[Created By]'],
 ['Send App Notification Task - 1','Loans','[_THISROW].[Closed By]'],
 ['Notify first-day receipt Task - 1','Loans','[_THISROW].[Created By]'],
 ['Task for Notify first-day charge receipt','Charges','[_THISROW].[Ref Loans].[Created By]'],
 ['Task for Send App Notification 2','Payments','[_THISROW].[Created By]'],
 ['Send closure summary Task - 1','Payments','[_THISROW].[Created By]'],
 ['Notify exact posted receipt Task - 1','Borrowers',commandActor('Borrowers')],
 ['R009 closure summary Task - 1','Borrowers',commandActor('Borrowers')],
 ['Notify exact posted receipt Task - 2','Charges',commandActor('Charges')],
 ['Send closure summary when loans closed Task - 1','Charges',commandActor('Charges')],
 ['Notify exact posted receipt Task - 3','Loans',commandActor('Loans')],
 ['Task for Send closure summary when loans closed','Loans',commandActor('Loans')]
].map(([task,table,actor])=>({task,table,actor,expression:recipientFor(actor)}));
