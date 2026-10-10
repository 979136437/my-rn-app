"""ADB regression checks for the development example; requires Python and adb.

Open the example first, then run with --adb PATH and optionally --serial DEVICE.
UI labels and gestures below are test fixtures, not production configuration.
"""

import argparse
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

REMOTE_DUMP = "/sdcard/nitro-refresh-scroll-lock.xml"
SWIPE_DURATION_MS = 500
STATUS_PATTERN = re.compile(
    r"(idle|pulling|ready|refreshing|finishing) · 下拉 .* · 滚动 (-?\d+) · 版本 (\d+) · 行点击 (\d+)"
)


class Example:
    def __init__(self, adb, serial):
        self.adb = [adb] + (["-s", serial] if serial else [])

    def command(self, *args):
        return subprocess.check_output([*self.adb, *map(str, args)])

    def snapshot(self):
        self.command("shell", "uiautomator", "dump", REMOTE_DUMP)
        return list(ET.fromstring(self.command("shell", "cat", REMOTE_DUMP)).iter("node"))

    @staticmethod
    def bounds(node):
        return tuple(map(int, re.findall(r"\d+", node.get("bounds", ""))))

    def position(self, label):
        for node in self.snapshot():
            if label in (node.get("text"), node.get("content-desc")):
                left, top, right, bottom = self.bounds(node)
                if right > left and bottom > top:
                    return (left + right) // 2, (top + bottom) // 2
        raise AssertionError(f"Visible button missing: {label}")

    def tap(self, label):
        self.command("shell", "input", "tap", *self.position(label))

    def status(self):
        for node in self.snapshot():
            match = STATUS_PATTERN.fullmatch(node.get("text", ""))
            if match:
                state, offset, version, clicks = match.groups()
                return state, int(offset), int(version), int(clicks)
        raise AssertionError("Example status missing")

    def swipe_arguments(self, down=False):
        # Expo's outer container can also report ScrollView; target the inner
        # list/scroll view rather than starting a gesture over the toolbar.
        for node in reversed(self.snapshot()):
            if node.get("class") == "android.widget.ScrollView":
                left, top, right, bottom = self.bounds(node)
                if right > left and bottom > top:
                    x = (left + right) // 2
                    start = top + (bottom - top) * 3 // 4
                    end = top + (bottom - top) // 4
                    if down:
                        start, end = end, start
                    return x, start, x, end, SWIPE_DURATION_MS
        raise AssertionError("Scrollable content missing")

    def swipe(self, down=False):
        self.command("shell", "input", "swipe", *self.swipe_arguments(down))

    def check_locked(self):
        before = self.status()
        assert before[0] == "refreshing", before
        self.swipe()
        after = self.status()
        assert after[:2] == before[:2], (before, after)
        self.swipe(down=True)
        assert self.status()[:2] == before[:2]

    def run(self):
        for mode in ("默认列表", "自定义 Header"):
            # Switching through short content also guarantees a fresh instance.
            self.tap("短内容")
            self.tap(mode)
            self.tap("主动刷新")
            self.check_locked()
            before = self.status()
            self.tap("点击第1条")
            assert self.status()[3] == before[3] + 1
            self.tap("滚到第5条")
            assert self.status()[1] > before[1]
            self.check_locked()
            self.tap("关闭列表滚动")
            self.tap("开启列表滚动")
            self.check_locked()
            self.tap("滚到顶部")
            assert self.status()[1] == 0, self.status()

            # Do not dump UI between finishing and the swipe: it would miss the
            # short native rebound. The intercepted stream stays consumed to UP.
            finish = self.position("完成")
            swipe = self.swipe_arguments()
            self.command("shell", "input", "tap", *finish)
            self.command("shell", "input", "swipe", *swipe)
            assert self.status()[:2] == ("idle", 0), self.status()
            self.swipe()
            assert self.status()[1] > 0, self.status()
            print(f"PASS: {mode}: lock, taps, programmatic scroll, prop updates, finishing and unlock", flush=True)

        self.tap("短内容")
        self.tap("默认列表")
        self.swipe(down=True)
        self.check_locked()
        self.tap("关闭列表滚动")
        self.tap("失败")
        before = self.status()
        assert before[0] == "idle", before
        self.swipe()
        assert self.status()[1] == before[1]
        self.tap("开启列表滚动")
        self.swipe()
        assert self.status()[1] > before[1]
        print("PASS: gesture refresh and caller scrollEnabled=false preserved after failure")

        self.tap("短内容")
        self.tap("主动刷新")
        before = self.status()
        self.tap("行内点击")
        assert self.status()[3] == before[3] + 1
        self.tap("失败")
        assert self.status()[0] == "idle"
        print("PASS: short ScrollView refresh, row tap and failure")

    def lifecycle_status(self, name):
        pattern = re.compile(
            rf"{name}:(\w+):(true|false):requests=(\d+):enabled=(true|false):reject=(true|false):scroll=(\d+):clicks=(\d+)"
        )
        for node in self.snapshot():
            match = pattern.fullmatch(node.get("text", ""))
            if match:
                return match.groups()
        raise AssertionError(f"Lifecycle control missing: {name}")

    def run_lifecycle(self):
        # Mount native-acceptance-screen.tsx in a temporary development route.
        initial = self.lifecycle_status("A")
        assert initial[:4] == ("refreshing", "true", "0", "false"), initial
        self.tap("A begin twice")
        assert self.lifecycle_status("A")[2] == "0"
        self.tap("A row tap")
        assert self.lifecycle_status("A")[6] == "1"
        self.tap("B begin twice")
        assert self.lifecycle_status("B")[:3] == ("refreshing", "true", "1")
        self.tap("B begin twice")
        assert self.lifecycle_status("B")[2] == "1"
        self.tap("B reopen")
        assert self.lifecycle_status("B")[:3] == ("refreshing", "true", "1")
        self.tap("toggle A")
        assert self.lifecycle_status("B")[:3] == ("refreshing", "true", "1")
        self.swipe()
        assert self.lifecycle_status("B")[5] == "0"
        self.tap("B row tap")
        assert self.lifecycle_status("B")[6] == "1"
        self.tap("B stop")
        assert self.lifecycle_status("B")[:2] == ("idle", "false")
        self.swipe()
        assert int(self.lifecycle_status("B")[5]) > 0
        self.tap("B reject")
        self.tap("B begin twice")
        assert self.lifecycle_status("B")[:3] == ("idle", "false", "2")
        self.swipe()
        assert int(self.lifecycle_status("B")[5]) > 0
        print("PASS: initial true, disabled/empty SectionList, row taps, duplicates, reopen, multiple instances, unmount and rejected request", flush=True)

    def run_native_gestures(self):
        # Fresh lifecycle screen; test distances are in dp, converted to pixels.
        self.tap("toggle A")
        density_text = self.command("shell", "wm", "density").decode()
        density = int(re.findall(r"density: (\d+)", density_text)[-1]) / 160
        x, y = self.position("B row tap")
        self.command("shell", "input", "swipe", x, y, x, y + round(30 * density), SWIPE_DURATION_MS)
        assert self.lifecycle_status("B")[:3] == ("idle", "false", "0")
        assert self.lifecycle_status("B")[6] == "0", "intercepted drag must cancel row press"
        self.command("shell", "input", "swipe", x, y, x, y + round(160 * density), SWIPE_DURATION_MS)
        assert self.lifecycle_status("B")[:3] == ("refreshing", "true", "1")
        texts = [node.get("text", "") for node in self.snapshot()]
        events = next(text for text in texts if text.startswith("B events:"))
        assert "pulling>finishing>idle" in events, events
        assert "ready>refreshing" in events, events
        peak = next(text for text in texts if text.startswith("B peak:"))
        match = re.fullmatch(r"B peak:([\d.]+):dragged=true", peak)
        assert match and float(match[1]) > 1, peak
        self.swipe()
        assert self.lifecycle_status("B")[5] == "0"
        self.tap("B stop")
        assert self.lifecycle_status("B")[:2] == ("idle", "false")
        pull = next(node.get("text", "") for node in self.snapshot() if node.get("text", "").startswith("B pull:"))
        assert pull == "B pull:0:progress=0.00:dragging=false", pull
        self.swipe()
        assert int(self.lifecycle_status("B")[5]) > 0
        print("PASS: below threshold, drag cancels row press, ready/release, progress above one, drag flag, lock and final idle/zero", flush=True)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adb", required=True)
    parser.add_argument("--serial")
    parser.add_argument("--lifecycle", action="store_true", help="Run against native-acceptance-screen.tsx instead of the example")
    parser.add_argument("--native-gestures", action="store_true", help="Check native drag transitions on a fresh lifecycle screen")
    args = parser.parse_args()
    example = Example(args.adb, args.serial)
    try:
        if args.native_gestures:
            example.run_native_gestures()
        elif args.lifecycle:
            example.run_lifecycle()
        else:
            example.run()
    finally:
        example.command("shell", "rm", "-f", REMOTE_DUMP)
