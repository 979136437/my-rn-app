"""Offline proof of diagnostic parsing, bounded gestures and cold-launch URLs."""
import importlib.util
import shlex
import unittest
from unittest.mock import patch
import urllib.parse
import xml.etree.ElementTree as ET
from pathlib import Path

spec = importlib.util.spec_from_file_location("android_acceptance", Path(__file__).with_name("android-scroll-lock.py"))
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class ScriptTests(unittest.TestCase):
    def test_zero_exit_unsupported_input_is_rejected(self):
        example = runner.Example.__new__(runner.Example)
        example.adb = ["adb"]
        with patch.object(runner.subprocess, "check_output", return_value=b"Error: Error: Unknown command: event"):
            with self.assertRaisesRegex(AssertionError, "Unknown command"):
                example.command("shell", "input", "event")

    def fixture(self):
        example = runner.Example.__new__(runner.Example)
        example.density = 2
        example.dev_server = "http://127.0.0.1:8081"
        example.params = {}
        example.calls = []
        example.command = lambda *args: example.calls.append(args)
        example.snapshot = lambda: [ET.Element("node", {
            "resource-id": "app:id/demo-A-viewport", "bounds": "[10,100][510,1100]"
        })]
        return example

    def test_pull_distance_uses_density_and_native_damping(self):
        example = self.fixture()
        example.swipe(offset=60)
        command = example.calls[-1]
        self.assertEqual(command[:3], ("shell", "input", "swipe"))
        self.assertEqual(command[3], 260)
        self.assertEqual(command[6] - command[4], 240)
        self.assertGreater(command[4], 100)
        self.assertLess(command[6], 1100)

    def test_normal_scroll_stays_inside_viewport(self):
        example = self.fixture()
        example.swipe(down=False)
        command = example.calls[-1]
        self.assertGreater(command[4], command[6])
        self.assertGreater(command[6], 100)
        self.assertLess(command[4], 1100)

    def test_unreachable_fixture_fails_instead_of_swiping_sibling_ui(self):
        example = self.fixture()
        with self.assertRaisesRegex(AssertionError, "viewport"):
            example.swipe(offset=1000)
        self.assertEqual(example.calls, [])

    def test_status_uses_stable_id_and_accessibility_payload(self):
        example = self.fixture()
        nodes = [ET.Element("node", {"resource-id": "app:id/demo-A-status", "content-desc": "name=A;state=idle;requests=2;events=pulling>ready>refreshing>idle"})]
        state = example.status(nodes=nodes)
        self.assertEqual(state["requests"], "2")
        self.assertIn("ready", state["events"])
        with self.assertRaises(AssertionError):
            example.status(name="B", nodes=nodes)

    def test_missing_payload_does_not_report_a_pass(self):
        example = self.fixture()
        nodes = [ET.Element("node", {"resource-id": "demo-A-status"})]
        with self.assertRaisesRegex(AssertionError, "payload"):
            example.status(nodes=nodes)

    def test_cold_launch_boots_dev_client_and_quotes_repeated_query(self):
        example = self.fixture()
        example.snapshot = lambda: [ET.Element("node", {"package": "com.x18588283042.myapp", "resource-id": "refresh-demo-entry"})]
        example.launch({"headerHeight": ["60", "80"], "enabled": "false"})
        self.assertEqual(example.calls[0], ("shell", "am", "force-stop", "com.x18588283042.myapp"))
        boot = example.calls[1][-2]
        self.assertIn("expo-development-client", boot)
        url = shlex.split(example.calls[-1][-2])[0]
        params = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
        self.assertEqual(params["headerHeight"], ["60", "80"])
        self.assertEqual(params["enabled"], ["false"])


if __name__ == "__main__":
    unittest.main()
