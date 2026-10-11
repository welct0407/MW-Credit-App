# Production contained foundation — shared default authentication

The owner selected existing **My First Project**, `clever-oasis-508610-n7` / `737787224638`, `lm.mw-credit.com`, and shared Google sign-in/default Firebase authentication for the same users. No tenant, new provider, re-enrollment or multi-tenancy change is proposed. The unbilled new project and its partial state are parked, not deleted/reused. This root is repository preparation only; default gates create nothing.

## One package, staged dependencies

- **State:** `../production-state-bootstrap` proposes a new protected `mw-credit-app-prod-tfstate-737787224638` bucket, distinct from DEV and parked state. It is not created. Review its actual plan/approval/migration before application initialization.
- **F1:** four separate PROD identities, one owner-secret container, `mw-credit-app-prod` Artifact Registry, dedicated build-source bucket, exact production federation once its subject is bound, new WebApp/Hosting site/domain. Existing Firebase project/default auth/provider/API resources stay with their current state owner and are neither imported nor recreated here. Proposed site `mw-credit-prod-737787224638` is not created or globally availability-verified.
- **F2:** trusted operator verifies the existing default-project enabled owner account, verified email and Google provider, matches authenticated evidence, and writes its actual UID privately to a numeric **PROD-specific** owner-secret version. The same UID may be valid because authentication is intentionally shared; do not copy a stale file or assume the existing secret remains authoritative. No new user enrollment or fake pin is needed.
- **F3:** two contained `services/production/server.mjs` services using a tested immutable image in the separate PROD artifact repository, shared exact issuer/audience, default/no-tenant policy and numeric PROD owner pin. They have no SQL/GCS client or business authority. Explicitly proposed service-specific invoker-check disablement is not allUsers IAM and does not authorize organization-policy weakening. Proposal bounds: min0/max1 instance each, concurrency5, CPU1/512Mi,15s request timeout; this no-data envelope is not business workload sizing.

Unknown outputs (WebApp config, certificate/DNS records, owner version, image digest, service URLs) stay unbound until authenticated readback. Public shell is workerless/no-store; enrollment phase has no endpoints, foundation phase only two session GETs. Shared authentication does not grant PROD membership/business authority. Do not claim DEV-token denial by issuer when the owner deliberately shares that issuer; wrong owner/provider/tenant/expiry still deny.

## Preserve existing shared configuration

`infrastructure/dev/auth-read.tf` owns the default Identity Platform config. The future approved change must add `lm.mw-credit.com` and the actual PROD fallback site domain without removing existing three DEV domains or changing provider/sign-in settings. Prepare that exact delta through its current owner; never declare a duplicate default config here. APIs likewise remain under their existing owner. No API enablement/default-auth/DEV source mutation is performed in this preparation.

Earlier tenant-list diagnostics are historical and irrelevant to this superseding shared-default design. No tenant or multi-tenancy resource exists in the current proposal.

## Least privilege and Hosting delivery

Runtime: custom `firebaseauth.users.get` only on the intentionally shared auth project, plus access to the one PROD owner-secret container; no auth administration, SQL, receipt storage, state or deployment role. Builder: PROD artifact writer, its dedicated build-source objects and logging only. Automated deployer: PROD artifact reader, developer role on exactly the two PROD services, actAs only their runtime identities and service-usage consumer. It has no Hosting admin, project-wide Run role, secret payload read or retained-data authority.

No supported site-scoped Hosting IAM policy/resource has been established from provider/API evidence. Specifying a site in a command is not IAM isolation. Proposed safe path: a protected trusted human operator publishes both sites with exact artifact/site/approval guards. Before claiming the DEV automated identity cannot change PROD Hosting, separately approve removal of existing `google_project_iam_member.hosting_deploy` from the **DEV** state and adapt its old delivery workflow. This root does not silently remove that permission. Until executed and verified, the known cross-site automated authority is an explicit unresolved boundary. No new automated Hosting admin grant is added. [Hosting IAM permissions](https://firebase.google.com/docs/projects/iam/permissions) and [Hosting REST site selection](https://firebase.google.com/docs/hosting/api-deploy).

WIF requires repository1408349602, owner322659955, main, production environment and explicit verified subject. D read back current GitHub customization: use_default=true, use_immutable_subject=true, sub_claim_prefix=`repo:welct0407@322659955/MW-Credit-App@1408349602`. Proposed production subject is that prefix plus `:environment:production`. An actual production-issued token and environment protection are not yet live proof. Null subject creates no federation; no workflow activates from this root.

## Validation and execution limits

Use Terraform1.16.5 with external private TF_DATA_DIR, `init -backend=false`, `fmt -check -recursive`, `validate`, `test`. Mocked plans do not establish cloud admission or authorization. Before live execution bind state, actual source/artifacts, owner pin, public config and URLs; review shared authorized-domain delta, Hosting permission removal/operator route and GitHub protection. No notification, scheduler, SQL/financial write, business readiness or cutover is included.

All new SAs/secrets/artifacts have deletion protection. Gates are not cleanup toggles after creation. Preserve private plans/state/version recovery and rollback matched artifacts/config; never destroy shared resources to undo a release.

## Current preparation evidence

Affected format/validation and5 application mock tests passed; the independent state root passed2 mock tests. F1 without federation/runtime proposes18 additions; the complete mocked F3 plus federation proposes29 additions, all nochange/delete. These are not live deployment results.

Read-only actual state-bucket saved plan:1create, SHA256690183679b2b269fe61745d4307ba4d72307dbad62c7da495815b4eb8b422da5. Read-only actual F1 preparation saved plan:18creates, SHA256b1830c50d84017c67ed8269686ba64cd157280f84dd493a9ca206b8e2eb217f2, runtimefalse/WIFnull. F1 was evaluated through a private local-backend wrapper of this exact module because the new GCS backend does not exist. Its module.foundation addresses are preparation-only: do not apply it as the final root deployment. After authorized state creation/migration, prepare and review a fresh exact root plan against the proper backend. Both plans are outsideGit and unapplied. The earlier new-project bootstrap approval does not authorize these changed-target plans.
