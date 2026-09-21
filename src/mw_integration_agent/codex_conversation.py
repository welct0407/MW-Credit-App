"""Stdio App Server client. Only host-owned dynamic tools are exposed."""
import json
import os
from pathlib import Path
import queue
import subprocess
import threading
import time

from .config import ConfigurationError


DISABLED = ('shell_tool', 'unified_exec', 'plugins', 'hooks', 'multi_agent',
            'multi_agent_v2', 'view_image', 'code_mode', 'apps',
            'browser_use', 'computer_use', 'image_generation', 'artifact',
            'workspace_dependencies', 'memories', 'skill_search', 'sleep_tool')


class CodexConversation:
    def __init__(self, config, binding, store, tools, call_tool):
        self.config, self.binding, self.store = config, binding, store
        self.tools, self.call_tool = tools, call_tool
        self.folder = Path(config['state_directory']) / 'partner-conversations' / binding
        self.folder.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.queue = queue.Queue()
        self.serial = 0
        self.thread_id = None
        self.turn_id = None

    def send(self, message):
        self.proc.stdin.write(json.dumps(message, ensure_ascii=False) + '\n')
        self.proc.stdin.flush()

    def receive(self, deadline):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise ConfigurationError('CONVERSATION_TIMEOUT_NO_REPLAY')
        try:
            event = self.queue.get(timeout=remaining)
        except queue.Empty:
            raise ConfigurationError('CONVERSATION_TIMEOUT_NO_REPLAY') from None
        if event is None:
            raise ConfigurationError('CONVERSATION_PROCESS_ENDED')
        if 'method' in event and 'id' in event:
            p = event.get('params', {})
            if (event['method'] == 'item/tool/call' and p.get('threadId') == self.thread_id
                    and (self.turn_id is None or p.get('turnId') == self.turn_id)
                    and not p.get('namespace')):
                try:
                    value = self.call_tool(p['tool'], p['arguments'], p['callId'])
                    result = {'success': True, 'contentItems': [
                        {'type': 'inputText', 'text': json.dumps(value, ensure_ascii=False)}]}
                except Exception as exc:
                    # Never expose HTTP bodies, credentials or tracebacks to the model.
                    result = {'success': False, 'contentItems': [
                        {'type': 'inputText', 'text': str(exc) if isinstance(exc, ConfigurationError)
                         else 'TOOL_FAILED_INSPECT_BEFORE_RETRY'}]}
                self.send({'id': event['id'], 'result': result})
            else:
                self.send({'id': event['id'], 'error': {'code': -32601, 'message': 'Host tool only; request denied'}})
        if event.get('method') == 'item/started':
            kind = event.get('params', {}).get('item', {}).get('type')
            if kind in ('commandExecution', 'fileChange', 'mcpToolCall', 'webSearch',
                        'collabAgentToolCall', 'imageGeneration', 'computerUse'):
                raise ConfigurationError('UNEXPECTED_BUILTIN_TOOL')
        return event

    def rpc(self, method, params, deadline):
        self.serial += 1
        serial = self.serial
        self.send({'id': serial, 'method': method, 'params': params})
        while True:
            event = self.receive(deadline)
            if event.get('id') == serial and 'method' not in event:
                if 'error' in event:
                    (self.folder / 'protocol-error.json').write_text(json.dumps(event), encoding='utf-8')
                    raise ConfigurationError('CONVERSATION_PROTOCOL_ERROR')
                return event['result']

    def run(self, instructions, request):
        # Fresh per-binding home: no owner plugins, MCP servers, rules or cross-partner memory.
        home = self.folder / 'codex-home'
        home.mkdir(exist_ok=True, mode=0o700)
        auth = Path(self.config['codex_home']) / 'auth.json'
        if not auth.is_file():
            raise ConfigurationError('CODEX_SIGN_IN_UNAVAILABLE')
        link = home / 'auth.json'
        if not link.exists():
            link.symlink_to(auth)
        if not link.is_symlink() or link.resolve() != auth.resolve():
            raise ConfigurationError('CONVERSATION_AUTH_BINDING_CHANGED')
        if (home / 'config.toml').exists():
            raise ConfigurationError('UNEXPECTED_CONVERSATION_CONFIG')
        settings = {}
        original = Path(self.config['codex_home']) / 'config.toml'
        if original.exists():
            import tomllib
            value = tomllib.loads(original.read_text())
            settings = {k: value[k] for k in ('model', 'model_reasoning_effort', 'service_tier') if k in value}
        args = [self.config['codex_executable'], 'app-server', '--listen', 'stdio://']
        for feature in DISABLED:
            args.extend(['--disable', feature])
        for setting in ('approval_policy="never"', 'web_search="disabled"',
                        'agents.enabled=false', 'tools.view_image=false',
                        'apps._default.enabled=false', 'history.persistence="none"'):
            args.extend(['-c', setting])
        for key, value in settings.items():
            args.extend(['-c', key + '=' + json.dumps(value)])
        env = {k: v for k, v in os.environ.items() if k in ('PATH', 'HOME', 'LANG', 'LC_ALL', 'SSL_CERT_FILE')}
        env['CODEX_HOME'] = str(home)
        with (self.folder / 'stderr.txt').open('w', encoding='utf-8') as stderr:
            self.proc = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=stderr,
                text=True, encoding='utf-8', env=env, cwd=self.folder)
            def pump():
                try:
                    for line in self.proc.stdout:
                        self.queue.put(json.loads(line))
                finally:
                    self.queue.put(None)
            reader = threading.Thread(target=pump, daemon=True)
            reader.start()
            deadline = time.monotonic() + self.config.get('conversation_timeout_seconds', 600)
            try:
                self.rpc('initialize', {'clientInfo': {'name': 'mw_partner_conversations', 'version': '1.0'},
                    'capabilities': {'experimentalApi': True}}, deadline)
                self.send({'method': 'initialized', 'params': {}})
                params = {'cwd': str(self.folder), 'approvalPolicy': 'never', 'sandbox': 'read-only',
                          'baseInstructions': instructions}
                previous = self.store.thread(self.binding)
                if previous:
                    params['threadId'] = previous
                    thread = self.rpc('thread/resume', params, deadline)['thread']
                    if thread['id'] != previous:
                        raise ConfigurationError('CONVERSATION_THREAD_MISMATCH')
                else:
                    params.update(dynamicTools=self.tools, environments=[], ephemeral=False)
                    thread = self.rpc('thread/start', params, deadline)['thread']
                    self.store.bind(self.binding, thread['id'])
                self.thread_id = thread['id']
                turn = self.rpc('turn/start', {'threadId': self.thread_id, 'environments': [],
                    'input': [{'type': 'text', 'text': request}]}, deadline)
                self.turn_id = turn['turn']['id']
                while True:
                    event = self.receive(deadline)
                    p = event.get('params', {})
                    if event.get('method') == 'turn/completed' and p.get('threadId') == self.thread_id:
                        if p['turn']['id'] != self.turn_id or p['turn'].get('status') != 'completed':
                            raise ConfigurationError('CONVERSATION_TURN_FAILED')
                        return
            finally:
                self.proc.terminate()
                try:
                    self.proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.proc.kill()
                    self.proc.wait()
                reader.join(timeout=3)
                self.proc.stdin.close()
                self.proc.stdout.close()
