# One-time dedicated VM control identity; never powers the VM on or off.
. "$PSScriptRoot/Monitoring.Common.ps1"
$az='C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd'
$subscription='50f792fa-803e-4280-833d-1fe60fef5293'
$tenant='9e29c895-606a-420b-acc2-1c24375df4d9'
$group="/subscriptions/$subscription/resourceGroups/RG-MWCREDIT"
$vm="$group/providers/Microsoft.Compute/virtualMachines/VM-01"
$credentialPath=Join-Path $MonitoringPrivate 'azure-vm-control-service-principal.json'
$account=& $az account show -o json|ConvertFrom-Json
if($account.id -ne $subscription -or $account.tenantId -ne $tenant -or $account.user.name -ne 'zhcyidea@gmail.com'){throw 'Azure identity mismatch'}
if(Test-Path $credentialPath){throw 'Existing control credential preserved; inspect before resuming'}
$existing=@(& $az ad sp list --display-name grafana-vm-control -o json|ConvertFrom-Json)
if($existing.Count){throw 'Existing matching principal; do not duplicate/reset'}
$roleName='MW Grafana VM-01 Power Control'
$existingRole=@(& $az role definition list --name $roleName -o json|ConvertFrom-Json)
if($existingRole.Count){throw 'Existing role; inspect before resuming'}
$role=@{Name=$roleName;IsCustom=$true;Description='Read state, start and deallocate VM-01 only. No VM modification, deletion, commands, disks or networking.';Actions=@('Microsoft.Compute/virtualMachines/read','Microsoft.Compute/virtualMachines/instanceView/read','Microsoft.Compute/virtualMachines/start/action','Microsoft.Compute/virtualMachines/deallocate/action');NotActions=@();DataActions=@();NotDataActions=@();AssignableScopes=@($group)}
$rolePath=Join-Path $MonitoringPrivate 'azure-vm-control-role.json'
Save-MonitoringJson $rolePath $role
$createdRole=& $az role definition create --role-definition $rolePath -o json|ConvertFrom-Json
if($LASTEXITCODE){throw 'Role creation failed'}
$secretJson=& $az ad sp create-for-rbac --name grafana-vm-control --skip-assignment --years 1 -o json
if($LASTEXITCODE){throw 'Principal creation failed; retain role and inspect'}
[IO.File]::WriteAllText($credentialPath,($secretJson -join "`n"))
$credential=($secretJson -join "`n")|ConvertFrom-Json
$principal=& $az ad sp show --id $credential.appId --query id -o tsv
$assignment=& $az role assignment create --assignee-object-id $principal --assignee-principal-type ServicePrincipal --role $createdRole.name --scope $vm -o json|ConvertFrom-Json
if($LASTEXITCODE){throw 'VM-scoped assignment failed; preserve created identity'}
$result=@{appId=$credential.appId;principalId=$principal;tenant=$tenant;subscription=$subscription;vm=$vm;roleDefinitionId=$createdRole.id;roleAssignmentId=$assignment.id;actions=$role.Actions;credentialStoredOutsideGit=$true}
Save-MonitoringJson 'outputs/resource-monitoring-20260922/azure-vm-control-identity.json' $result
$result|ConvertTo-Json -Depth 5
