"""Codex CLI receipt provider: an isolated, tool-less `codex exec` with the shared prompt and output schema."""
import json
import os
import subprocess
import tempfile
import time
from pathlib import Path

from .receipt_image import PROMPT, SCHEMA, RecognitionUnavailable

TIMEOUT = 180


def model(_config):
    # No model override: the service owner's/default CLI model choice is used and reported as such.
    return 'default'


def extract(config, image_data, deadline=None):
    timeout = TIMEOUT if deadline is None else max(0.001, min(TIMEOUT, deadline - time.monotonic()))
    root=Path(config['state_directory'])/'receipt-extraction'
    root.mkdir(parents=True,exist_ok=True,mode=0o700)
    with tempfile.TemporaryDirectory(dir=root) as directory:
        work=Path(directory)
        (work/'image.png').write_bytes(image_data)
        (work/'schema.json').write_text(json.dumps(SCHEMA),encoding='utf-8')
        command=[config['codex_executable'],'exec','--ignore-user-config','--ignore-rules',
                 '--ephemeral','--skip-git-repo-check','--sandbox','read-only',
                 '-C',str(work),'--image',str(work/'image.png'),
                 '--output-schema',str(work/'schema.json'),'-o',str(work/'result.json'),'--json']
        for setting in ('approval_policy="never"','features.shell_tool=false','features.unified_exec=false',
                        'agents.enabled=false','tools.view_image=false','web_search="disabled"',
                        'apps._default.enabled=false','history.persistence="none"'):
            command.extend(['-c',setting])
        env={k:v for k,v in os.environ.items() if k in ('PATH','HOME','LANG','LC_ALL','SSL_CERT_FILE')}
        env['CODEX_HOME']=config['codex_home']
        try:
            run=subprocess.run(command+['-'],input=PROMPT,text=True,encoding='utf-8',
                               capture_output=True,timeout=timeout,env=env,check=True)
            for line in run.stdout.splitlines():
                event=json.loads(line)
                kind=event.get('item',{}).get('type','')
                if kind in ('command_execution','mcp_tool_call','web_search','file_change','collab_tool_call'):
                    raise ValueError('unexpected tool')
            return json.loads((work/'result.json').read_text(encoding='utf-8'))
        except subprocess.TimeoutExpired as exc:
            raise RecognitionUnavailable('timeout') from exc
        except (OSError,subprocess.SubprocessError,ValueError) as exc:
            raise RecognitionUnavailable() from exc
