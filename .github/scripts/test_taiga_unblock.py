import unittest

from taiga_unblock import find_unblockable, parse_blockers


def item(ref, closed=False, blocked_by=None, manual=False):
    blocked = blocked_by is not None or manual
    note = "Bloquejada per: " + ", ".join(f"#{r}" for r in blocked_by) if blocked_by else ("Esperant el client" if manual else "")
    return {
        "ref": ref,
        "id": ref * 10,
        "subject": f"element {ref}",
        "version": 1,
        "is_blocked": blocked,
        "blocked_note": note,
        "status_extra_info": {"is_closed": closed},
    }


def index(items):
    return {i["ref"]: i for i in items}


class ParseBlockersTest(unittest.TestCase):
    def test_extracts_refs_of_the_convention(self):
        self.assertEqual(parse_blockers("Bloquejada per: #31, #33"), [31, 33])

    def test_ignores_manual_notes_and_empty(self):
        self.assertIsNone(parse_blockers("Esperant el client #5"))
        self.assertIsNone(parse_blockers("Bloquejada per:"))
        self.assertIsNone(parse_blockers(""))
        self.assertIsNone(parse_blockers(None))


class FindUnblockableTest(unittest.TestCase):
    def test_task_blocked_by_closed_task_is_unblocked(self):
        items = [item(276, closed=True), item(218, blocked_by=[276])]
        unblockable, dangling = find_unblockable(items, index(items))
        self.assertEqual([(i["ref"], b) for i, b in unblockable], [(218, [276])])
        self.assertEqual(dangling, [])

    def test_story_blocked_by_closed_task_is_unblocked(self):
        items = [item(304, closed=True), item(44, blocked_by=[304])]
        unblockable, _ = find_unblockable(items, index(items))
        self.assertEqual([i["ref"] for i, _ in unblockable], [44])

    def test_stays_blocked_while_any_blocker_is_open(self):
        items = [item(296, closed=True), item(297, closed=False), item(299, blocked_by=[296, 297])]
        unblockable, _ = find_unblockable(items, index(items))
        self.assertEqual(unblockable, [])

    def test_manual_block_is_not_touched(self):
        items = [item(5, manual=True)]
        unblockable, dangling = find_unblockable(items, index(items))
        self.assertEqual((unblockable, dangling), ([], []))

    def test_reference_to_missing_element_is_reported_and_kept_blocked(self):
        items = [item(10, blocked_by=[999])]
        unblockable, dangling = find_unblockable(items, index(items))
        self.assertEqual(unblockable, [])
        self.assertEqual([(i["ref"], m) for i, m in dangling], [(10, [999])])

    def test_not_blocked_items_are_ignored(self):
        items = [item(1), item(2, closed=True)]
        unblockable, dangling = find_unblockable(items, index(items))
        self.assertEqual((unblockable, dangling), ([], []))


if __name__ == "__main__":
    unittest.main()
