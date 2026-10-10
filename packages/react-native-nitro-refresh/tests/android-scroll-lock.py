"""Parameter-driven Android acceptance. Requires a matching native development client.
No control buttons, fixed screen coordinates, or native builds are used.
"""
import argparse
import itertools
import json
import re
import shlex
import subprocess
import time
import urllib.parse
import xml.etree.ElementTree as ET
from pathlib import Path

REMOTE_DUMP = '/sdcard/nitro-refresh-acceptance.xml'
TIMEOUT = 35
DURATION_MS = 500
DAMPING = 0.5  # Android RefreshDefaults.kt contract, test fixture only.


class Example:
    def __init__(self, adb, serial, output, dev_server):
        self.adb = [adb] + (['-s', serial] if serial else [])
        self.output = Path(output)
        self.dev_server = dev_server
        self.params = {}
        self.last_xml = b''
        density = self.command('shell', 'wm', 'density').decode()
        self.density = int(re.findall(r'(?:Physical|Override) density: (\d+)', density)[-1]) / 160

    def command(self, *args):
        output = subprocess.check_output([*self.adb, *map(str, args)], timeout=45, stderr=subprocess.STDOUT)
        # Some Android input commands return zero even when unsupported.
        if b'Error: Unknown command:' in output:
            raise AssertionError(output.decode(errors='replace'))
        return output

    def snapshot(self):
        self.command('shell', 'uiautomator', 'dump', REMOTE_DUMP)
        self.last_xml = self.command('shell', 'cat', REMOTE_DUMP)
        return list(ET.fromstring(self.last_xml).iter('node'))

    def find(self, identifier, nodes=None):
        for node in self.snapshot() if nodes is None else nodes:
            if node.get('resource-id', '').split('/')[-1] == identifier:
                return node
        raise AssertionError(f'Missing {identifier}; client may be outdated, unloaded, or showing an error')

    def status(self, name='A', nodes=None):
        node = self.find(f'demo-{name}-status', nodes)
        text = node.get('content-desc', '')
        if not text.startswith(f'name={name};'):
            raise AssertionError(f'Diagnostic payload unavailable: {text}')
        return dict(item.split('=', 1) for item in text.split(';'))

    def wait(self, predicate, name='A', timeout=TIMEOUT):
        deadline = time.monotonic() + timeout
        last = None
        while time.monotonic() < deadline:
            try:
                last = self.status(name)
                if predicate(last):
                    return last
            except AssertionError as error:
                last = str(error)
            time.sleep(0.2)
        raise AssertionError(f'Timeout for {name}: {last}')

    def open(self, name='A', **params):
        self.launch(params)
        return self.wait(lambda s: True, name)

    def launch(self, params):
        self.params = params
        # Cold launch prevents previous route params, histories and tasks leaking into a case.
        self.command('shell', 'am', 'force-stop', 'com.x18588283042.myapp')
        boot = 'exp+my-app://expo-development-client/?url=' + urllib.parse.quote(self.dev_server, safe='')
        self.command('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', shlex.quote(boot), 'com.x18588283042.myapp')
        deadline = time.monotonic() + TIMEOUT
        while time.monotonic() < deadline:
            nodes = self.snapshot()
            texts = [n.get('text', '') for n in nodes if n.get('package') == 'com.x18588283042.myapp']
            if 'There was a problem loading the project.' in texts:
                raise AssertionError('Development client failed to connect to Metro; ensure --dev-server is running and reachable')
            if any(n.get('resource-id', '').endswith(('refresh-demo-entry', '-status')) for n in nodes):
                break
            time.sleep(0.2)
        else:
            raise AssertionError('React page did not load; ensure device is unlocked and development client can reach Metro')
        url = 'myapp://refresh-demo?' + urllib.parse.urlencode(params, doseq=True)
        # adb joins remote argv; shell-quote URL so & cannot execute as a shell operator.
        self.command('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', shlex.quote(url), 'com.x18588283042.myapp')

    @staticmethod
    def bounds(node):
        return tuple(map(int, re.findall(r'\d+', node.get('bounds', ''))))

    def swipe(self, down=True, offset=None, name='A'):
        left, top, right, bottom = self.bounds(self.find(f'demo-{name}-viewport'))
        height = bottom - top
        margin = max(1, height // 12)
        start = top + margin if down else bottom - margin
        distance = height - 2 * margin if offset is None else round(offset * self.density / DAMPING)
        if distance > height - 2 * margin:
            raise AssertionError(f'Gesture needs {distance}px but viewport has {height - 2 * margin}px; use smaller threshold or larger device')
        end = start + distance if down else start - distance
        x = (left + right) // 2
        self.command('shell', 'input', 'swipe', x, start, x, end, DURATION_MS)

    def pull_back(self):
        left, top, right, bottom = self.bounds(self.find('demo-A-viewport'))
        x = (left + right) // 2
        start = top + (bottom - top) // 12
        distance = round(90 * self.density / DAMPING)
        assert start + distance < bottom, 'Viewport too small for pull-back fixture'
        # OEM help may call this "event", but the actual command is motionevent.
        self.command('shell', 'input', 'motionevent', 'DOWN', x, start)
        try:
            for fraction in [0.25, 0.5, 0.75, 1, 0.75, 0.5, 0.25]:
                self.command('shell', 'input', 'motionevent', 'MOVE', x, round(start + distance * fraction))
        finally:
            self.command('shell', 'input', 'motionevent', 'UP', x, round(start + distance * 0.25))
        state = self.finished(requests=0, revision=0)
        assert float(state['peak']) > 1 and 'ready' in state['events'], state

    def tap_row(self, name='A'):
        node = self.find(f'demo-{name}-row-1')
        left, top, right, bottom = self.bounds(node)
        self.command('shell', 'input', 'tap', (left + right) // 2, (top + bottom) // 2)

    def finished(self, requests=1, revision=1, name='A'):
        return self.wait(lambda s: s['state'] == 'idle' and int(s['requests']) == requests and int(s['revision']) == revision and abs(float(s['offset'])) < 0.5, name)

    def preflight(self):
        self.open(scenario='initial-refresh', headerHeight=60, triggerDistance=90, refreshDurationMs=15000)
        state = self.wait(lambda s: s['state'] == 'refreshing')
        assert state['nativeTrigger'] != 'none', 'Native client has old RefreshPull bindings; compile and install the updated client before native tests'
        assert float(state['nativeTrigger']) == 90, 'Native client does not include triggerDistance; rebuild requires separate authorization'
        assert abs(float(state['offset']) - 60) < 1, state
        assert abs(float(state['progress']) - 60 / 90) < 0.02, state

    def matrix(self):
        for container, content, header in itertools.product(['scroll-view', 'flat-list', 'section-list'], ['long', 'short', 'empty'], ['default', 'lottie']):
            self.open(container=container, content=content, header=header)
            self.swipe(offset=90)
            state = self.finished()
            assert state['dragged'] == 'true' and float(state['peak']) >= 1, state
            assert 'ready' in state['events'] and 'refreshing' in state['events'], state
            print(f'PASS matrix {container}/{content}/{header}', flush=True)

    def gestures(self):
        for height, trigger in [(90, 40), (60, 60), (60, 90), (30, 130)]:
            self.open(headerHeight=height, triggerDistance=trigger)
            self.swipe(offset=trigger / 2)
            self.finished(requests=0, revision=0)
            self.swipe(offset=trigger * 1.25)
            state = self.finished()
            assert float(state['peak']) > 1 and state['clicks'] == '0', state
            print(f'PASS threshold height={height} trigger={trigger}', flush=True)
        self.open()
        self.pull_back()
        for flag in ['enabled', 'scrollEnabled']:
            self.open(**{flag: 'false'})
            self.swipe()
            assert self.status()['requests'] == '0'
        self.open(initialOffset=180)
        before = self.wait(lambda s: float(s['scroll']) > 100)
        self.swipe(offset=30)
        assert self.status()['requests'] == '0', before
        self.open()
        self.tap_row()
        assert self.status()['clicks'] == '1'
        self.swipe(offset=90)
        assert self.finished()['clicks'] == '1', 'Dragging must cancel the row press'
        for result, revision in [('failure', 0), ('reject', 0), ('success', 1)]:
            self.open(result=result)
            self.swipe(offset=90)
            self.finished(revision=revision)
            self.swipe(offset=90)
            self.finished(requests=2, revision=revision * 2)
        self.open(refreshDurationMs=20000)
        self.swipe(offset=90)
        locked = self.wait(lambda s: s['state'] == 'refreshing')
        for down in [False, True]:
            self.swipe(down=down)
            after = self.status()
            assert after['state'] == 'refreshing' and abs(float(after['scroll']) - float(locked['scroll'])) < 1, after
        self.tap_row()
        assert self.status()['clicks'] == '1'
        self.finished()
        self.swipe(down=False)
        self.wait(lambda s: float(s['scroll']) > 10)
        print('PASS thresholds, flags, non-top, clicks, retry, lock and unlock', flush=True)

    def lifecycle(self):
        for scenario in ['initial-refresh', 'begin-twice', 'disable-refreshing', 'reopen-finishing', 'update-height', 'update-threshold']:
            overrides = {'triggerDistance': 60} if scenario == 'update-threshold' else {}
            self.open(scenario=scenario, **overrides)
            if scenario not in ['initial-refresh', 'begin-twice']:
                self.swipe(offset=150 if scenario == 'update-threshold' else 90)
            expected_requests = 0 if scenario == 'initial-refresh' else 1
            expected_revision = 2 if scenario == 'reopen-finishing' else 1
            state = self.finished(expected_requests, expected_revision)
            if scenario == 'disable-refreshing':
                assert state['enabled'] == 'false'
            if scenario == 'update-height':
                assert float(state['height']) == 120 and float(state['nativeTrigger']) == 120
            if scenario == 'update-threshold':
                assert float(state['trigger']) == 120 and float(state['nativeTrigger']) == 120
            print(f'PASS lifecycle {scenario}', flush=True)
        self.open(scenario='unmount-refreshing', refreshDurationMs=500)
        self.swipe(offset=90)
        self.find('demo-A-unmounted')
        time.sleep(0.6)
        self.find('demo-A-unmounted')
        self.open(name='B', scenario='two-instances')
        self.find('demo-A-unmounted')
        self.swipe(offset=90, name='B')
        self.finished(name='B')
        self.open()
        self.finished(requests=0, revision=0)
        print('PASS unmount, isolation and route re-entry', flush=True)

    def disabled_requests(self):
        self.open(scenario='initial-refresh', enabled='false')
        self.finished(requests=0, revision=1)
        self.open(scenario='begin-twice', enabled='false')
        self.finished(requests=0, revision=0)
        print('PASS controlled refresh allowed while disabled; explicit begin rejected', flush=True)

    def parameters(self):
        for params in [{'headerHeight': '0'}, {'triggerDistance': 'NaN'}, {'enabled': 'yes'}, {'container': 'unknown'}, {'unknown': '1'}, {'header': ''}, {'headerHeight': ['60', '80']}]:
            self.launch(params)
            deadline = time.monotonic() + TIMEOUT
            while time.monotonic() < deadline:
                nodes = self.snapshot()
                if any(n.get('resource-id', '').split('/')[-1] == 'demo-parameter-error' for n in nodes):
                    assert not any(n.get('resource-id', '').endswith('demo-A-status') for n in nodes)
                    break
                time.sleep(0.2)
            else:
                raise AssertionError(f'Invalid parameters did not show error: {params}')
        print('PASS invalid route parameters do not mount native control', flush=True)

    def evidence(self, error):
        self.output.mkdir(parents=True, exist_ok=True)
        try:
            self.snapshot()
        except Exception:
            pass
        (self.output / 'failure-ui.xml').write_bytes(self.last_xml)
        keys = ['ro.product.model', 'ro.build.version.sdk', 'ro.build.version.release', 'ro.product.cpu.abi']
        device = {key: self.command('shell', 'getprop', key).decode(errors='replace').strip() for key in keys}
        info = {'parameters': self.params, 'error': str(error), 'device': device}
        (self.output / 'failure.json').write_text(json.dumps(info, ensure_ascii=False, indent=2), encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--adb', required=True)
    parser.add_argument('--serial')
    parser.add_argument('--dev-server', default='http://127.0.0.1:8081')
    parser.add_argument('--suite', choices=['all', 'preflight', 'matrix', 'gestures', 'lifecycle', 'parameters', 'disabled-requests'], default='all')
    parser.add_argument('--output', default='packages/react-native-nitro-refresh/tests/artifacts')
    args = parser.parse_args()
    example = Example(args.adb, args.serial, args.output, args.dev_server)
    try:
        if urllib.parse.urlparse(args.dev_server).hostname in ['127.0.0.1', 'localhost']:
            port = urllib.parse.urlparse(args.dev_server).port or 8081
            example.command('reverse', f'tcp:{port}', f'tcp:{port}')
        example.preflight()
        print('PASS native interface preflight', flush=True)
        for suite in ['matrix', 'gestures', 'lifecycle', 'parameters']:
            if args.suite in ['all', suite]:
                getattr(example, suite)()
        if args.suite in ['all', 'disabled-requests']:
            example.disabled_requests()
    except Exception as error:
        example.evidence(error)
        raise SystemExit(f'FAIL: {error}; evidence: {example.output}') from error


if __name__ == '__main__':
    main()
