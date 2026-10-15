"""Fixed semantic command mapping; never a caller-selected SQL/table patch API."""
from decimal import Decimal, InvalidOperation
import re
from .config import ConfigurationError
from .conversation_api import request_id

FIELDS = {
 'Payments': ('payment', {'borrowerId':'Ref Borrower','amountReceived':'Amount Received','paymentDate':'Payment Date',
  'createdAt':'Created At','paymentMethod':'Payment Method','allocationMethod':'Allocation Method','bankReference':'Bank Reference',
  'notes':'Notes','targetChargeId':'Ref Target Charge','targetLoanId':'Ref Target Loan','cashAccountId':'Ref Received By Cash Account','cashHolderId':'Ref Received By Cash Holder'}),
 'Payment Allocations': ('allocation', {'paymentId':'Ref Payment','chargeId':'Ref Charge','chargeDateSnapshot':'Charge Date Snapshot',
  'chargeRowNumberSnapshot':'Charge Row Number Snapshot','interestRemainingSnapshot':'Interest Remaining Snapshot',
  'principalRemainingSnapshot':'Principal Remaining Snapshot','amountRemainingSnapshot':'Amount Remaining Snapshot',
  'allocationOrder':'Allocation Order','allocatedInterest':'Allocated Interest','allocatedPrincipal':'Allocated Principal',
  'allocatedAmount':'Allocated Amount','createdAt':'Created At'}),
 'Borrowers': ('borrower', {'name':'Borrower Name','description':'Description','communicationName':'Communication Name',
  'instagramUsername':'Instagram Username','city':'City','workingLocation':'Working Location','address':'Address',
  'hidden':'Hidden Flag','referrerId':'Ref Referrer','preferredReceivingAccountId':'Ref Preferred Receiving Cash Account','note':'Borrower Note'}),
 'Loans': ('loan', {'borrowerId':'Ref Borrowers','loanDate':'Loan Date','principal':'Principal Amount','transferFee':'Transfer Fee',
  'disbursingAccountId':'Ref Disbursed From Cash Account','type':'Loan Type','dueDate':'Due Date','dailyPayment':'Daily Payment Amount',
  'fixedInterest':'Fixed Interest','currentDailyInterest':'Current Daily Interest','paymentInterval':'Interest Payment Interval',
  'arrangement':'Loan Arrangement','autoChargeEnabled':'Auto Charge Enabled'}),
 'Charges': ('charge', {'loanId':'Ref Loans','chargeDate':'Charge Date','principalDue':'Principal Due','interestDue':'Interest Due','notes':'Notes'}),
 'Business Expenses': ('expense', {'expenseDate':'Expense Date','category':'Expense Category','amount':'Amount','payeeName':'Payee Name',
  'relatedBorrowerId':'Ref Related Borrower','relatedLoanId':'Ref Related Loan','notes':'Notes','paidByAccountId':'Ref Paid By Cash Account'}),
 'Cash Pool Contributions': ('capital-contribution', {'partnerId':'Ref Partner','contributionDate':'Contribution Date','transactionType':'Transaction Type','amount':'Amount','notes':'Notes'}),
 'Settlements': ('settlement', {'settlementDate':'Settlement Date','partnerId':'Ref Partner','amount':'Amount','status':'Status','transferDate':'Transfer Date','notes':'Notes','cashAccountId':'Ref Paid From Cash Account'}),
 'Cash Ledger': ('cash-movement', {'movementDate':'Movement Date','movementType':'Movement Type','amount':'Amount','fromAccountId':'Ref From Cash Account','toAccountId':'Ref To Cash Account','businessExpenseId':'Ref Business Expense','notes':'Notes'}),
 'Loan Assessment': ('assessment', {'borrowerId':'Ref Borrower','proposedLoanAmount':'Proposed Loan Amount','minimumDailyProfitRate':'Minimum Daily Profit Rate'}),
 'Cash Statement Context': ('preference', {'statementAccountId':'Ref Cash Account','statementDate':'Statement Date'}),
}
# These nullable optional inputs are explicit native form semantics, not unknown defaults.
OPTIONAL = {
 'Payments': {'bankReference','notes','targetChargeId','targetLoanId','cashAccountId','cashHolderId'},
 'Payment Allocations': {'chargeDateSnapshot','chargeRowNumberSnapshot','interestRemainingSnapshot','principalRemainingSnapshot',
  'amountRemainingSnapshot','allocationOrder','allocatedInterest','allocatedPrincipal','allocatedAmount','createdAt'},
 'Borrowers': {'description','communicationName','instagramUsername','city','workingLocation','address','referrerId','preferredReceivingAccountId','note'},
 'Loans': {'dueDate','dailyPayment','fixedInterest','currentDailyInterest','paymentInterval','arrangement'},
 'Charges': {'notes'}, 'Business Expenses': {'payeeName','relatedBorrowerId','relatedLoanId','notes'},
 'Cash Pool Contributions': {'notes'}, 'Settlements': {'transferDate','notes'}, 'Cash Ledger': {'businessExpenseId','notes'},
 'Loan Assessment': set(),
 'Cash Statement Context': {'statementAccountId','statementDate'},
}


def scalar(value, source_type):
    if value is None:
        return None
    if source_type in ('Price','Decimal','Percent','Number'):
        try:
            raw=str(value).replace(',','').replace('฿','').strip()
            amount=Decimal(raw.rstrip('%'))
            if raw.endswith('%'): amount/=100
            if not amount.is_finite(): raise InvalidOperation()
            return format(amount,'f')
        except (ValueError,InvalidOperation):
            raise ConfigurationError('INVALID_NATIVE_NUMBER') from None
    if source_type=='Yes/No':
        if type(value) is bool:return value
        parsed={'true':True,'false':False,'yes':True,'no':False,'y':True,'n':False}.get(str(value).lower())
        if parsed is None:raise ConfigurationError('INVALID_NATIVE_BOOLEAN')
        return parsed
    return value


def build_operation(config, message_id, step, table, action, ident, supplied, definition, current=None, defaults=None):
    if table not in FIELDS:
        raise ConfigurationError('NATIVE_SEMANTIC_MAPPING_REQUIRED')
    family, fields=FIELDS[table]
    if table=='Loans' and ('Interest Schedule Anchor Date' in supplied or (current and 'Interest Schedule Anchor Date' in current)):
        fields={**fields,'scheduleAnchor':'Interest Schedule Anchor Date'}
    request=request_id(config['conversation_api_environment'],message_id,step)
    target=request if action=='Add' else ident
    current=current or {}
    merged={**(defaults or {}),**current,**supplied}
    allowed=set(fields.values())|{'Created By','Updated By','Closed By'}
    operation=family+'.'+{'Add':'create','Edit':'update','Delete':'delete'}[action]
    special={}
    predecessor=None
    metadata=current.get('_nativeCommand') or {}
    if 'Payment Request Token' in supplied:
        token=supplied['Payment Request Token']
        if not isinstance(token,str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}\|[A-Za-z0-9_-]{8,64}(\|[^|\s]{1,254})?',token) or token.split('|')[0]!=definition['context']['businessDate'] or token==current.get('Payment Request Token'):
            raise ConfigurationError('NATIVE_PAYMENT_REQUEST_STALE_OR_INVALID')
    if table in ('Borrowers','Charges') and 'Payment Request Token' in supplied:
        if action!='Edit' or set(supplied)-{'Payment Request Token','Payment Request Cash Account'}:
            raise ConfigurationError('SPLIT_SEMANTIC_ACTION_FROM_FIELD_EDIT')
        quick=metadata.get('quickPayment')
        account=merged.get('Payment Request Cash Account')
        if not quick or quick['paymentDate']!=definition['context']['businessDate'] or not account:
            raise ConfigurationError('NATIVE_QUICK_PAYMENT_PREPARATION_REQUIRED')
        prepared=defaults or {}
        if not prepared.get('Created At') or not prepared.get('Ref Received By Cash Holder'):
            raise ConfigurationError('NATIVE_QUICK_PAYMENT_DEFAULTS_REQUIRED')
        inputs={**quick,'createdAt':prepared['Created At'],'paymentMethod':'Bank Transfer','bankReference':None,
                'notes':'Account confirmed in quick payment command','cashAccountId':account,
                'cashHolderId':prepared['Ref Received By Cash Holder']}
        return {'kind':'operation','command':{'requestId':request,'operation':'payment.create','targetId':request,
                'expectedVersion':None,'predecessorRequestId':None,'inputs':inputs,'receiptId':None}}
    if table=='Payment Allocations' and (metadata.get('allocationParent') or {}).get('status')=='Posted':
        parent=metadata['allocationParent']
        if action!='Edit' or set(supplied)!={'Ref Charge'}:
            raise ConfigurationError('POSTED_ALLOCATION_REQUIRES_PARENT_PAYMENT_CORRECTION')
        return {'kind':'operation','command':{'requestId':request,'operation':'payment.move-interest','targetId':parent['id'],
                'expectedVersion':parent['version'],'predecessorRequestId':parent['predecessorRequestId'],
                'inputs':{'allocationId':ident,'targetChargeId':supplied['Ref Charge']},'receiptId':None}}
    if table=='Payments':
        if action!='Add':
            if not metadata:raise ConfigurationError('NATIVE_PAYMENT_PREPARATION_REQUIRED')
            predecessor=metadata.get('predecessorRequestId')
            if action=='Edit':
                if 'Created At' in supplied:
                    if set(supplied)!={'Created At'}:raise ConfigurationError('SPLIT_SEMANTIC_ACTION_FROM_FIELD_EDIT')
                    return {'kind':'operation','command':{'requestId':request,'operation':'payment.update-metadata','targetId':ident,
                            'expectedVersion':current.get('_nativeVersion'),'predecessorRequestId':predecessor,
                            'inputs':{'createdAt':supplied['Created At']},'receiptId':None}}
                correction_keys={'borrowerId','amountReceived','paymentDate','paymentMethod','cashAccountId','notes','allocationMethod','targetChargeId','targetLoanId'}
                if any(f not in {fields[k] for k in correction_keys} for f in supplied):
                    raise ConfigurationError('NATIVE_PAYMENT_FIELD_REQUIRES_RECONCILIATION')
                fields={k:f for k,f in fields.items() if k in correction_keys}
                operation='payment.correct'
        if 'Status' in supplied and supplied['Status']!='Processing':raise ConfigurationError('NATIVE_PAYMENT_STATUS_ENGINE_OWNED')
        allowed.add('Status')
    if table=='Loans' and ('Payment Request Token' in supplied or supplied.get('Loan Status')=='ปิดยอดแล้ว'):
        if set(supplied)-{'Payment Request Token','Payment Request Cash Account','Loan Status','Closed By'}:
            raise ConfigurationError('SPLIT_SEMANTIC_ACTION_FROM_FIELD_EDIT')
        close=metadata.get('close')
        if not close or close['sourceVersion']!=current.get('_nativeVersion'):
            raise ConfigurationError('NATIVE_CLOSE_PREVIEW_REQUIRED')
        account=merged.get('Payment Request Cash Account')
        if not account:raise ConfigurationError('NATIVE_CLOSE_RECEIVING_ACCOUNT_REQUIRED')
        operation='loan.close'
        special={'paymentDate':close['businessDate'],'cashAccountId':account,'paymentMethod':'Bank Transfer',
                 'notes':None,'expectedAmount':close['amount'],'expectedPlanHash':close['planHash']}
    elif table=='Loans' and 'Defaulted' in supplied:
        if set(supplied)!={'Defaulted'}:raise ConfigurationError('SPLIT_SEMANTIC_ACTION_FROM_FIELD_EDIT')
        operation='loan.default' if scalar(supplied['Defaulted'],'Yes/No') else 'loan.undo-default'
        special={'businessDate':definition['context']['businessDate']} if operation=='loan.default' else {}
    elif table=='Loans' and 'Charge Generation Request' in supplied:
        if set(supplied)!={'Charge Generation Request'}:raise ConfigurationError('SPLIT_SEMANTIC_ACTION_FROM_FIELD_EDIT')
        operation='loan.generate-charge';special={'businessDate':definition['context']['businessDate']}
    elif table=='Loan Assessment' and 'SQL Refresh Token' in supplied:
        if set(supplied)!={'SQL Refresh Token'}:raise ConfigurationError('SPLIT_SEMANTIC_ACTION_FROM_FIELD_EDIT')
        operation='assessment.refresh'
    elif any(field not in allowed for field in supplied):
        raise ConfigurationError('NATIVE_SEMANTIC_MAPPING_REQUIRED')
    if action=='Delete' or operation.endswith(('.default','.undo-default','.generate-charge','.refresh','.close')):
        inputs=special
    else:
        inputs={}
        for key, field in fields.items():
            if field not in merged:
                if action=='Add' and key in OPTIONAL[table]:inputs[key]=None;continue
                raise ConfigurationError('NATIVE_DEFAULT_OR_CURRENT_FIELD_REQUIRED:'+field)
            value=scalar(merged[field],definition['columns'].get(field,{}).get('Type'))
            if (key=='amountReceived' or (key=='amount' and table in ('Business Expenses','Cash Ledger'))) and value is not None:
                amount=Decimal(str(value))
                if amount==0 or (key=='amountReceived' and amount<0) or amount!=amount.to_integral_value():raise ConfigurationError('NATIVE_PAYMENT_WHOLE_BAHT_REQUIRED')
                value=str(int(amount))
            if key in ('allocationOrder','chargeRowNumberSnapshot') and value is not None:
                number=Decimal(str(value))
                if number!=number.to_integral_value():raise ConfigurationError('INVALID_NATIVE_INTEGER')
                value=str(int(number))
            if key=='paymentInterval' and value is not None:
                if Decimal(str(value))!=int(Decimal(str(value))):raise ConfigurationError('INVALID_NATIVE_INTERVAL')
                value=int(Decimal(str(value)))
            inputs[key]=value
    version=None if action=='Add' else current.get('_nativeVersion')
    if table=='Payments' and action=='Edit':
        kind=metadata['kind']
        if kind=='pwa-plan':
            plan=metadata.get('plan')
            if not isinstance(plan,dict) or not isinstance(plan.get('allocations'),list):raise ConfigurationError('NATIVE_PAYMENT_PLAN_REQUIRED')
            inputs['allocations']=plan['allocations']
        else:
            selection=current.get('Selected Charge IDs')
            inputs['selectedChargeIds']=None if not selection else [part.strip() for part in selection.split(',') if part.strip()]
        inputs={'kind':kind,'fields':inputs,'receiptMode':'preserve'}
    if table=='Cash Statement Context':
        if action!='Edit' or not metadata:raise ConfigurationError('NATIVE_PREFERENCE_PREPARATION_REQUIRED')
        operation='preference.update';target=metadata['partnerId'];version=metadata['version']
        inputs['language']=metadata['language']
    if table=='Loan Assessment' and operation in ('assessment.create','assessment.update'):
        inputs.update(assessmentId=merged.get('Assessment ID'),
                      forecastStart=metadata.get('forecastStart') or definition['context']['businessDate'],
                      forecastEnd=metadata.get('forecastEnd') or definition['context']['businessDate'])
    if action!='Add' and (not isinstance(version,str) or len(version)!=64):
        raise ConfigurationError('NATIVE_CURRENT_VERSION_REQUIRED')
    return {'kind':'operation','command':{'requestId':request,'operation':operation,'targetId':target,
            'expectedVersion':version,'predecessorRequestId':predecessor,'inputs':inputs,'receiptId':None}}
