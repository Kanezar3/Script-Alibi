# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import hashlib
import json
from genlayer import *


class EvidenceProbe(gl.Contract):
    last_url: str
    last_start_line: u256
    last_end_line: u256
    last_sha256: str
    last_char_len: u256
    last_excerpt: str
    probe_count: u256

    def __init__(self):
        self.last_url = ""
        self.last_start_line = u256(0)
        self.last_end_line = u256(0)
        self.last_sha256 = ""
        self.last_char_len = u256(0)
        self.last_excerpt = ""
        self.probe_count = u256(0)

    @gl.public.write
    def probe_url(self, url: str, start_line: int, end_line: int) -> None:
        if start_line < 1 or end_line < start_line:
            raise gl.vm.UserError("Invalid line range")

        target_url = str(url)
        s_line = int(start_line)
        e_line = int(end_line)

        def leader_fn() -> dict:
            resp = gl.nondet.web.get(target_url)
            if int(resp.status) != 200:
                raise gl.vm.UserError(f"HTTP {resp.status}")
            raw_text = resp.body.decode("utf-8", errors="replace")
            norm = raw_text.replace("\r\n", "\n").replace("\r", "\n")
            lines = norm.split("\n")
            if e_line > len(lines):
                raise gl.vm.UserError(
                    f"end_line {e_line} exceeds total lines {len(lines)}"
                )
            selected = lines[s_line - 1 : e_line]
            snippet = " ".join(" ".join(selected).split())[:3000]
            digest = hashlib.sha256(snippet.encode("utf-8")).hexdigest()
            return {
                "sha256": digest,
                "char_len": len(snippet),
                "excerpt": snippet[:280],
            }

        def validator_fn(leaders_res: gl.vm.Result) -> bool:
            if not isinstance(leaders_res, gl.vm.Return):
                return False
            val_res = leader_fn()
            return val_res["sha256"] == leaders_res.calldata["sha256"]

        res = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        self.last_url = target_url
        self.last_start_line = u256(s_line)
        self.last_end_line = u256(e_line)
        self.last_sha256 = res["sha256"]
        self.last_char_len = u256(int(res["char_len"]))
        self.last_excerpt = res["excerpt"]
        self.probe_count = self.probe_count + u256(1)

    @gl.public.view
    def get_last_probe(self) -> str:
        return json.dumps(
            {
                "url": self.last_url,
                "start_line": int(self.last_start_line),
                "end_line": int(self.last_end_line),
                "sha256": self.last_sha256,
                "char_len": int(self.last_char_len),
                "excerpt": self.last_excerpt,
                "probe_count": int(self.probe_count),
            },
            sort_keys=True,
        )
