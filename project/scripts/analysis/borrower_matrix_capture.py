"""Capture scoped borrower-matrix evidence using one read-only PROD transaction.

All source rows and definitions stay outside Git. This never alters DB objects/data.
Run with bundled Python; psycopg is the existing project-managed dependency.
"""
from pathlib import Path as _DatabasePath
import sys as _database_sys
_database_sys.path.insert(0, str(_DatabasePath(__file__).resolve().parents[1]))
from database_location import DATABASE_REPO_ROOT
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import sys

REPO = Path(__file__).resolve().parents[2]
PRIVATE = Path.home() / "Documents/ChatGPT/AppSheet-Loan-Project/borrower-matrix-20260924"
sys.path.insert(0, str(Path(os.environ["LOCALAPPDATA"]) / "AppSheetLoanTools/python-deps"))
import psycopg
from psycopg.rows import dict_row

VIEWS = ["olap_borrowers_analytics", "olap_charges_analytics", "olap_loans_analytics"]
TABLES = ["Borrowers", "Loans", "Charges", "Repayments", "Payments", "Payment Allocations"]


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows", action="store_true")
    args = parser.parse_args()
    target = json.loads((DATABASE_REPO_ROOT / "database/environments.json").read_text())["production"]
    assert (target["instance"], target["host"], target["database"]) == (
        "appsheet-pg-prod-20260914", "34.21.174.215", "loan_manager_prod")
    secret_path = Path(target["passwordFile"]).resolve()
    assert secret_path.is_relative_to((Path.home() / "Documents/ChatGPT").resolve())
    evidence = {}
    with psycopg.connect(host=target["host"], port=target["port"], dbname=target["database"],
                         user=target["user"], password=secret_path.read_text().strip(),
                         sslmode="require", connect_timeout=20, row_factory=dict_row,
                         options="-c default_transaction_read_only=on -c statement_timeout=60000") as conn:
        conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        evidence["identity"] = conn.execute("""SELECT current_database() AS database,
          current_user AS db_user, inet_server_addr()::text AS server_address,
          current_setting('transaction_read_only') AS read_only,
          current_setting('transaction_isolation') AS isolation,
          current_timestamp AS captured_at,
          (current_timestamp AT TIME ZONE 'Asia/Bangkok')::date AS business_date""").fetchone()
        assert evidence["identity"]["database"] == target["database"]
        assert evidence["identity"]["read_only"] == "on"
        evidence["migration"] = conn.execute("SELECT max(version::int) AS version FROM public.flyway_schema_history WHERE success").fetchone()
        evidence["columns"] = conn.execute("""SELECT table_name,column_name,data_type
          FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY(%s)
          ORDER BY table_name,ordinal_position""", (TABLES + VIEWS,)).fetchall()
        evidence["views"] = {v: conn.execute("SELECT pg_get_viewdef(%s::regclass,true) AS definition", ("public." + v,)).fetchone()["definition"] for v in VIEWS}
        if args.rows:
            spec = json.loads((Path(__file__).with_name("borrower_matrix_fields.json")).read_text())
            evidence["rows"] = {}
            from psycopg import sql
            for table, fields in spec.items():
                known = {c["column_name"] for c in evidence["columns"] if c["table_name"] == table}
                assert table in TABLES + VIEWS and set(fields).issubset(known), table
                query = sql.SQL("SELECT {} FROM public.{} ORDER BY {}" ).format(
                    sql.SQL(",").join(map(sql.Identifier, fields)), sql.Identifier(table), sql.Identifier("Row ID"))
                evidence["rows"][table] = conn.execute(query).fetchall()
        conn.rollback()
    PRIVATE.mkdir(parents=True, exist_ok=True)
    kind = "snapshot" if args.rows else "metadata"
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    output = PRIVATE / f"{kind}-{stamp}.json"
    raw = json.dumps(evidence, default=str, ensure_ascii=False, indent=2).encode("utf-8")
    output.write_bytes(raw)
    summary = {"private_file": str(output), "sha256": hashlib.sha256(raw).hexdigest(),
               "identity": evidence["identity"], "migration": evidence["migration"],
               "row_counts": {t: len(r) for t, r in evidence.get("rows", {}).items()}}
    print(json.dumps(summary, default=str))


if __name__ == "__main__":
    run()
