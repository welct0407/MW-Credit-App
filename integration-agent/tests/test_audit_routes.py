"""Every audit route written by agent code is one the V1 audit.events CHECK accepts.

A rejected route fails the event insert: a terminal event is lost (the operation stays
DISPATCHING) or the whole intent transaction rolls back. The scan covers every call to
audit.event, audit.activity and audit.audited in src/ and scripts/, keyword or positional.
"""
import ast
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# Positional index of `route` in each audit entry point.
POSITION = {'event': 4, 'activity': 3, 'audited': 1}
DEFAULT = 'internal'


def allowed_routes():
    text = (ROOT / 'database/migrations/V1__audit_and_control.sql').read_text()
    found = re.search(r"route text NOT NULL CHECK\(route IN \(([^)]*)\)\)", text)
    return set(re.findall(r"'([^']+)'", found.group(1)))


def literals(node):
    """Route strings an expression can take; None when it is not a literal choice."""
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return {node.value}
    if isinstance(node, ast.IfExp):
        body, other = literals(node.body), literals(node.orelse)
        return None if body is None or other is None else body | other
    return None


def routes():
    """(location, route) for every audit call; route None marks a non-literal argument."""
    for path in sorted((ROOT / 'src').rglob('*.py')) + sorted((ROOT / 'scripts').glob('*.py')):
        for node in ast.walk(ast.parse(path.read_text(), str(path))):
            if not isinstance(node, ast.Call):
                continue
            name = node.func.attr if isinstance(node.func, ast.Attribute) else getattr(node.func, 'id', None)
            if name not in POSITION:
                continue
            where = f'{path.relative_to(ROOT)}:{node.lineno}'
            arg = next((k.value for k in node.keywords if k.arg == 'route'), None)
            if arg is None and len(node.args) > POSITION[name]:
                arg = node.args[POSITION[name]]
            if arg is None:
                yield where, DEFAULT
                continue
            values = literals(arg)
            # audit.py forwards its own `route` parameter; anything else must be a literal.
            if values is None and not (path.name == 'audit.py' and isinstance(arg, ast.Name)):
                yield where, None
            for value in values or ():
                yield where, value


class AuditRouteTests(unittest.TestCase):
    def test_v1_check_lists_the_known_routes(self):
        self.assertEqual(allowed_routes(), {'appsheet', 'postgres', 'instagram', 'email', 'codex', 'internal', 'migration'})

    def test_every_audit_route_is_accepted_by_the_check(self):
        allowed = allowed_routes()
        found = list(routes())
        self.assertGreater(len(found), 20)
        self.assertEqual([(w, r) for w, r in found if r not in allowed], [])

    def test_scan_sees_keyword_positional_and_conditional_routes(self):
        found = {r for _, r in routes()}
        # receipt_image (keyword), conversation_write (positional, conditional), operator_audit (migration).
        self.assertTrue({'codex', 'internal', 'postgres', 'migration', 'instagram', 'email'} <= found)


if __name__ == '__main__':
    unittest.main()
