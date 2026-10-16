"""Behavioral safety checks on disposable fixtures, never the maintained dictionary."""
import copy
import tempfile
import unittest
from pathlib import Path

from common import (at, digest, dump, equal, load, load_text, make_index, validate,
                    write_json, write_yaml)
from dictionary import read, search, update


class DictionaryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.file = "systems/example/tables/loan.yaml"
        self.path = self.root / self.file
        self.doc = {"format": 1, "identity": {"system": "example", "component": "app", "kind": "table", "name": "Loan", "scope": "test"},
                    "verification": {"status": "imported-unreconciled", "source": "synthetic"},
                    "content": {"columns": {"Status": {"rules": {"Formula": "=IF(TRUE,\n  \"ใช่\", \"No\")", "Boolean": False,
                                                                "Empty": "", "Null": None, "List": ["B", "A"]}}}}}
        write_yaml(self.path, self.doc)
        write_yaml(self.root / "catalog.yaml", {"format": 1, "systems": {"example": {"status": "active", "kinds": ["table"]}}})
        write_yaml(self.root / "unresolved.yaml", {"format": 1, "items": []})
        write_json(self.root / "index.json", make_index(self.root))

    def patch(self, pointer="/content/columns/Status/rules/Formula", old=None, new="=TRUE"):
        return {"file": self.file, "expected_sha256": digest(self.path.read_bytes()), "evidence": "synthetic.md", "reason": "Fixture change",
                "changes": [{"pointer": pointer, "expected": old if old is not None else {"state": "value", "value": at(self.doc, pointer)},
                             "target": {"state": "value", "value": new}}]}

    def test_exact_scalar_and_multiline_roundtrip(self):
        values = ["Yes", "No", "false", False, 0, "0", "", None, "2026-09-23", "=SUM([Amount])", "a\nb\n", "a\nb\n\n", "ไทย\r\ntext"]
        for value in values:
            self.assertTrue(equal(load_text(dump({"value": value})), {"value": value}))
        self.assertFalse(equal(False, 0))

    def test_reject_duplicate_keys_aliases_tags_merge(self):
        for text in ['"x": 1\n"x": 2', '"x": &a 1\n"y": *a', '"x": !!str true', '"<<": {}']:
            with self.assertRaises(ValueError):
                load_text(text)

    def test_preview_then_apply_only_target_changes(self):
        before = self.path.read_bytes()
        patch = self.patch()
        self.assertFalse(update(self.root, patch)["applied"])
        self.assertEqual(before, self.path.read_bytes())
        self.assertTrue(update(self.root, patch, True)["applied"])
        actual = load(self.path)
        expected = copy.deepcopy(self.doc)
        expected["content"]["columns"]["Status"]["rules"]["Formula"] = "=TRUE"
        actual.pop("evidence")
        self.assertTrue(equal(actual, expected))
        self.assertFalse(validate(self.root)["errors"])

    def test_stale_hash_and_old_value_rejected(self):
        before = self.path.read_bytes()
        patch = self.patch()
        patch["expected_sha256"] = "stale"
        with self.assertRaisesRegex(ValueError, "Stale"):
            update(self.root, patch, True)
        patch = self.patch()
        patch["changes"][0]["expected"]["value"] = "wrong"
        with self.assertRaisesRegex(ValueError, "Old-value"):
            update(self.root, patch, True)
        self.assertEqual(before, self.path.read_bytes())

    def test_false_zero_and_null_absent_not_interchangeable(self):
        for pointer, wrong in [("Boolean", 0), ("Null", "")]:
            patch = self.patch("/content/columns/Status/rules/" + pointer, {"state": "value", "value": wrong})
            with self.assertRaisesRegex(ValueError, "Old-value"):
                update(self.root, patch)
        with self.assertRaisesRegex(ValueError, "Old-value"):
            update(self.root, self.patch("/content/columns/Status/rules/Null", {"state": "absent"}))

    def test_add_and_remove_with_absence_guard(self):
        pointer = "/content/columns/Status/rules/New"
        patch = self.patch(pointer, {"state": "absent"}, None)
        update(self.root, patch, True)
        patch["expected_sha256"] = digest(self.path.read_bytes())
        patch["changes"][0].update(expected={"state": "value", "value": None}, target={"state": "absent"})
        update(self.root, patch, True)
        self.assertNotIn("New", load(self.path)["content"]["columns"]["Status"]["rules"])

    def test_overlaps_and_identity_edits_rejected(self):
        patch = self.patch()
        patch["changes"].append(copy.deepcopy(patch["changes"][0]))
        with self.assertRaisesRegex(ValueError, "overlapping"):
            update(self.root, patch)
        patch = self.patch()
        patch["changes"][0]["pointer"] = "/identity/name"
        with self.assertRaisesRegex(ValueError, "Only content"):
            update(self.root, patch)

    def test_list_requires_whole_ordered_value(self):
        pointer = "/content/columns/Status/rules/List"
        patch = self.patch(pointer, new=["A", "B"])
        update(self.root, patch, True)
        self.assertEqual(at(load(self.path), pointer), ["A", "B"])
        patch = self.patch()
        patch["changes"][0]["pointer"] = pointer + "/0"
        with self.assertRaisesRegex(ValueError, "ordered list"):
            update(self.root, patch)

    def test_path_escape_and_concurrent_lock(self):
        patch = self.patch()
        patch["file"] = "../outside.yaml"
        with self.assertRaisesRegex(ValueError, "inside"):
            update(self.root, patch)
        lock = self.path.with_suffix(".yaml.lock")
        lock.touch()
        with self.assertRaises(FileExistsError):
            update(self.root, self.patch(), True)
        self.assertTrue(lock.exists())

    def test_extension_registration_index_and_lookup(self):
        self.assertEqual(search(self.root, "Status")[0]["file"], self.file)
        result = read(self.root, self.file, "/content/columns/Status")
        self.assertEqual(result["verification"]["status"], "imported-unreconciled")
        doc = copy.deepcopy(self.doc)
        doc["identity"]["system"] = "new-system"
        write_yaml(self.path, doc)
        self.assertTrue(validate(self.root)["errors"])
        catalog = load(self.root / "catalog.yaml")
        catalog["systems"]["new-system"] = {"status": "active", "kinds": ["table"]}
        write_yaml(self.root / "catalog.yaml", catalog)
        self.assertTrue(validate(self.root)["errors"])  # Index is stale.
        write_json(self.root / "index.json", make_index(self.root))
        self.assertFalse(validate(self.root)["errors"])

    def test_resolved_and_future_coverage_are_not_open_limitations(self):
        write_yaml(self.root / "unresolved.yaml", {"format": 1, "items": [
            {"id": "A", "status": "deferred"}, {"id": "B", "status": "resolved"},
            {"id": "C", "status": "informational"},
        ]})
        report = validate(self.root)
        self.assertEqual(report["recorded_limitations"], 1)
        self.assertEqual(report["resolved_items"], 1)
        self.assertEqual(report["informational_items"], 1)

    def test_invalid_evidence_and_planned_system_fail_validation(self):
        doc = copy.deepcopy(self.doc)
        doc["evidence"] = {"/content/missing": {"reference": "test.md", "reason": "test", "state": "value"}}
        write_yaml(self.path, doc)
        self.assertTrue(validate(self.root, check_index=False)["errors"])
        write_yaml(self.path, self.doc)
        catalog = load(self.root / "catalog.yaml")
        catalog["systems"]["example"]["status"] = "planned"
        write_yaml(self.root / "catalog.yaml", catalog)
        self.assertTrue(validate(self.root, check_index=False)["errors"])


if __name__ == "__main__":
    unittest.main()
