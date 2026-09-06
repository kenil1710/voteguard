# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json


class BalProbe(gl.Contract):
    out: str

    def __init__(self):
        self.out = ""

    @gl.public.write.payable
    def probe(self) -> None:
        """What does this runner actually expose for a contract's own balance?"""
        found = {}
        try:
            found["gl_attrs"] = sorted([a for a in dir(gl) if not a.startswith("_")])
        except Exception as e:
            found["gl_attrs_err"] = str(e)[:200]
        try:
            found["message_attrs"] = sorted(
                [a for a in dir(gl.message) if not a.startswith("_")])
        except Exception as e:
            found["message_attrs_err"] = str(e)[:200]
        for name in ("contract_balance", "balance", "get_balance",
                     "contract_address", "address"):
            try:
                v = getattr(gl, name)
                found["gl." + name] = str(v)[:80]
            except Exception as e:
                found["gl." + name] = "ERR " + str(e)[:60]
        for name in ("value", "sender_address", "contract_address", "balance"):
            try:
                found["msg." + name] = str(getattr(gl.message, name))[:80]
            except Exception as e:
                found["msg." + name] = "ERR " + str(e)[:60]
        self.out = json.dumps(found)

    @gl.public.view
    def get(self) -> str:
        return str(self.out)
