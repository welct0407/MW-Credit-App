/** A relationship is a bounded query descriptor, never an eagerly expanded list. */
export function relationshipDescriptor(scope,resource,field,row,_businessDate){
 const eq=(field,value)=>({op:'eq',field,value});
 const base=(resource,predicate)=>({scope,resource,predicate,limit:1001});
 if(resource==='Borrowers'&&field==='Todays Collection Charges')return base('Charges',{op:'and',args:[eq('Borrower Reference TE',row['Row ID']),eq('Collection Today',true)]});
 if(resource==='Borrowers'&&field==='Related Referral Expenses')return base('Business Expenses',{op:'and',args:[eq('Ref Payee Borrower',row['Row ID']),eq('Source Type','Referral Rebate')]});
 if(resource==='Payments'&&field==='Visible Allocations')return base('Payment Allocations',{op:'and',args:[eq('Ref Payment',row['Row ID']),{op:'gt',field:'Allocated Amount',value:'0'}]});
 if(resource==='Payments'&&field==='Eligible Charges'){
  if(!['Processing','Error'].includes(row.Status))return {scope,resource:'Charges',empty:true,limit:1001};
  const args=[eq('Borrower Reference TE',row['Ref Borrower']),{op:'gt',field:'Amount Remaining',value:'0'}];
  if(['Single Full','Single Partial','First-day Auto'].includes(row['Allocation Method'])){
   if(!row['Ref Target Charge'])return {scope,resource:'Charges',empty:true,limit:1001};
   args.push(eq('Row ID',row['Ref Target Charge']));
  }else if(row['Allocation Method']==='Loan Close'){
   if(!row._targetChargeLoan)return {scope,resource:'Charges',empty:true,limit:1001};
   args.push(eq('Ref Loans',row._targetChargeLoan));
  }else if(['Receive All','Lump Sum'].includes(row['Allocation Method']))args.push({op:'lte',field:'Charge Date',value:row['Payment Date']});
  else return {scope,resource:'Charges',empty:true,limit:1001};
  return base('Charges',{op:'and',args});
 }
 return null;
}
