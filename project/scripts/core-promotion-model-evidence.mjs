// Rendered production appdoc values inspected in Chrome on 15 September 2026.
// This records reviewed configuration; it does not write to AppSheet.
import fs from 'node:fs/promises';
const validity={Valid_If:null,Error_Message_If_Invalid:null,Show_If:null,Required_If:null,Editable_If:null,Reset_If:null,Suggested_Values:null};
const textType={MaxLength:null,MinLength:null,LongTextFormatting:'Plain Text',IsMulticolumnKey:false,...validity};
const refType=table=>({ReferencedTableName:table,ReferencedRootTableName:table,ReferencedType:'Text',ReferencedTypeQualifier:JSON.stringify(textType),ReferencedKeyColumn:'Row ID',IsAPartOf:false,RelationshipName:null,InputMode:'Auto',...validity});
const base={'Editable Initial Value?':'Yes','Fixed definition?':'No','Formula version':'0',Hidden:'No',Key:'No',Label:'No',LocaleName:'en-US','Part of Key?':'No','Read-Only':'Yes','Reset on edit?':'No',Scannable:'No',Searchable:'Yes','Sensitive data':'No','System Defined?':'No','Virtual?':'No','Visible?':'ALWAYS'};
const model={captured:'2026-09-15',source:'Saved production appdoc and current editor, Chrome',versions:{OLTP:'3.000094',OLAP:'1.100062'},rollback:{OLTP:'3.000080',OLAP:'1.100056'},columns:[],rules:[],tablesRemoved:['Process for Create First-Day Charge Process Table','Create First-Day Charge Output','Process for Generate Daily Charges - 1 Process Table',"Generate Today's Charge Output",'Process for Auto Receive First-Day Charge - 1 Process Table','Receive First-Day Charge Output','Process for Payments - Process Receipt - 1 Process Table','Payment - Process Receipt Output'],tablesAdded:[]};
for(const app of ['OLTP','OLAP']){
 const add=(table,name,props)=>model.columns.push({app,table,properties:{'Column name':name,...base,...props}});
 add('Loans','Ref Closing Payment',{Type:'Ref','Display name':'="รายการรับชำระที่ปิดยอด / Closing Payment"','Type Qualifier':JSON.stringify(refType('Payments'))});
 add('Loans','Charge Generation Request',{Type:'Text',Hidden:'Yes',Searchable:'No','Read-Only':app==='OLTP'?'No':'Yes','Type Qualifier':JSON.stringify({...textType,Editable_If:app==='OLTP'?'=FALSE':null})});
 add('Payments','Ref Target Loan',{Type:'Ref','Read-Only':app==='OLTP'?'No':'Yes','Display name':'="เงินกู้ที่ปิดยอด / Closing Loan"','Type Qualifier':JSON.stringify({...refType('Loans'),Editable_If:app==='OLTP'?'=FALSE':null})});
 for(const [table,name,target,ref] of [['Loans','Related Payments','Payments','Ref Target Loan'],['Payments','Related Loans','Loans','Ref Closing Payment']]){
  add(table,name,{Type:'List','App formula':`REF_ROWS("${target}", "${ref}")`,Description:`${target} entries that reference this entry in the ${ref} column`,'NFC Scannable':'No','System Defined?':'Yes','Virtual?':'Yes','Type Qualifier':JSON.stringify({ElementType:'Ref',ElementTypeQualifier:JSON.stringify(refType(target)),ItemSeparator:' , ',...validity})});
 }
 for(const [property,value]of [['Editable Initial Value?','Yes'],['Fixed definition?','No']])model.rules.push({app,table:'Payments',column:'Row ID',property,value});
}
model.rules.push(
 {app:'OLTP',table:'Payments',column:'Amount Received',property:'Type Qualifier.Valid_If',value:'=OR(IN([Row ID], Payments[Row ID]), AND([Allocation Method] = "Loan Close", ISNOTBLANK([Ref Target Loan]), [Ref Target Loan].[Ref Borrowers] = [Ref Borrower], [_THIS] > 0, [_THIS] = ROUND([_THIS])), AND([_THIS] > 0, [_THIS] = ROUND([_THIS]), [_THIS] <= [Eligible Outstanding], IF(IN([Allocation Method], LIST("Single Full", "Receive All", "First-day Auto", "Loan Close")), [_THIS] = [Eligible Outstanding], TRUE)))'},
 {app:'OLTP',table:'Payments',column:'Ref Target Charge',property:'Type Qualifier.Required_If',value:'=OR(IN([Allocation Method], LIST("Single Full", "Single Partial", "First-day Auto")), AND([Allocation Method] = "Loan Close", ISBLANK([Ref Target Loan])))'},
 {app:'OLAP',table:'Loans',column:'Default Loss Amount',property:'Type Qualifier.CurrencySymbol',value:'฿'},
 {app:'OLAP',table:'Loans',column:'Default Loss Amount',property:'Type Qualifier.DecimalDigits',value:'0'}
);
for(const [name,id,path]of [['First-day receipt exists Output','d339e871-f887-4acc-9f8a-15ec8358798b','StepOutput_First-day receipt exists'],['Notify payment-closed loans Output','d93019b5-64f3-4a8f-840f-44cc8566a206','StepOutput_Notify payment-closed loans'],['Process for Notification - First-Day Charge Process Table','60128599-b96a-4e31-b611-7a8940567cec','State Table']])model.tablesAdded.push(['OLTP','v3.000094',name,'native',`/ProcessStateTables/93844270-6aa5-420b-a960-bcdf08abd357/${id}/${path}`,name+'_Schema','READ_ONLY','AppSheet internal process metadata']);
model.slice={app:'OLAP',name:'Reporting Loans',source:'Loans',permission:'READ_ONLY',filter:'',actions:'**auto**',appendedColumns:['Ref Closing Payment','Charge Generation Request','Related Payments']};
model.comparison={businessTablesBindingsPermissionsUnchanged:true,existingViewsUnchanged:true,removedBusinessColumns:0,removedSlices:0,otherBusinessColumnPropertiesUnchanged:true,paymentKey:'Row ID remains hidden Text key, Read-Only Yes, UNIQUEID("PackedUUID"), no reset',changedOperationalActions:16,newGeneratedRefActions:2,olapExistingActionsUnchanged:true};
await fs.writeFile('outputs/core-promotion-20260915/model-evidence.json',JSON.stringify(model,null,2)+'\n');
