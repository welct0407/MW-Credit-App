import { DEV_INSTANCE, DEV_PROJECT } from '../api/dev-read-config.mjs';
export const COMMAND_DB_USER = 'mw-credit-app-command-dev@clever-oasis-508610-n7.iam';
/** Runtime identity checks do not grant privileges or authenticate browser claims. */
export function createDevCommandConnectionGuard(config) {
  if (config?.projectId !== DEV_PROJECT || config.instance !== DEV_INSTANCE
    || config.database !== 'loan_manager_dev' || config.dbUser !== COMMAND_DB_USER
    || !Array.isArray(config.registeredCreators) || !config.registeredCreators.length
    || config.registeredCreators.some(value => typeof value !== 'string' || !value)) throw Error('Invalid DEV command target');
  const creators = [...config.registeredCreators];
  return async client => {
    const row = (await client.query(`SELECT current_database() AS database,
      current_user AS principal, session_user AS session,
      rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls,
      pg_has_role(session_user,'mw_app_dev','MEMBER') AS member,
      pg_has_role(session_user,'mw_app_dev_journal_owner','MEMBER') AS owner_member,
      EXISTS(SELECT 1 FROM pg_roles creator WHERE creator.rolname=ANY($1::text[])
        AND pg_has_role(session_user,creator.oid,'MEMBER')) AS creator_member
      FROM pg_roles WHERE rolname=session_user`, [creators])).rows[0];
    if (!row || row.database !== 'loan_manager_dev' || row.principal !== COMMAND_DB_USER
      || row.session !== COMMAND_DB_USER || !row.rolcanlogin || row.rolsuper
      || row.rolcreatedb || row.rolcreaterole || row.rolreplication || row.rolbypassrls
      || !row.member || row.owner_member || row.creator_member) throw Error('DEV command identity unavailable');
  };
}
