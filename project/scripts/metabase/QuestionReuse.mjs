// Shared question identity. Page-specific titles, formatting and filter mappings belong to placements.
export const questionReuse = {
 'b-principal': {retired:79, canonical:48, reason:'One-row Portfolio Overview outstanding principal'},
 'r-principal': {retired:108, canonical:48, reason:'One-row Portfolio Overview outstanding principal'},
 'b-top': {retired:80, canonical:59, reason:'Same Portfolio Overview top borrower field'},
 'p-growth': {retired:95, canonical:56, reason:'Same completed seven-day growth field'},
 'r-interest': {retired:109, canonical:81, reason:'Same borrower lifetime-interest aggregate'},
 'i-interest': {retired:142, canonical:81, reason:'Same borrower lifetime-interest aggregate; borrower filter belongs to placement'},
 'f-realized': {retired:147, canonical:51, reason:'One-row Portfolio Overview realized MTD profit'},
 'f-estimate': {retired:149, canonical:52, reason:'One-row Portfolio Overview projected monthly profit'},
 'c-paid-borrowers': {retired:127, canonical:120, fieldRename:{'Borrower Count':'Fully paid'}, model:'collections', reason:'Summary count is the same Fully Paid worklist population'},
 'c-partial-borrowers': {retired:130, canonical:121, fieldRename:{'Borrower Count':'Partially paid'}, model:'collections', reason:'Summary count is the same Partially Paid worklist population'},
};

export function renamePresentation(value, names={}) {
 if(typeof value==='string')return Object.entries(names).reduce((s,[from,to])=>s.replaceAll(from,to),value);
 if(Array.isArray(value))return value.map(v=>renamePresentation(v,names));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[renamePresentation(k,names),renamePresentation(v,names)]));
 return value;
}

export function reuseQuestionSpec(q) {
 const reuse=questionReuse[q.key];if(!reuse)return q;
 const {dataset_query,...placement}=q;
 return {...placement,model:reuse.model??q.model,reuse_card_id:reuse.canonical,
  settings:renamePresentation(q.settings,reuse.fieldRename),
  description:`Reuses saved question ${reuse.canonical}. ${reuse.reason}.`};
}
