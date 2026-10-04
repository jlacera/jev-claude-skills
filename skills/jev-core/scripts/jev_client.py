"""jev_client.py — zero-dependency Jev client (Python >= 3.9) for FastAPI services, scripts and workers.

Calls Jev (TypeSafe AI) through the Vercel AI Gateway evaluation HTTP API:
    POST https://ai-gateway.vercel.sh/v1/evaluate  {model, state, questions, providerOptions}

Environment:
    AI_GATEWAY_API_KEY  required
    JEV_MODEL           default "typesafe-ai/jev"
    JEV_BASE_URL        default "https://ai-gateway.vercel.sh/v1"
    JEV_ZDR             "0" disables Zero Data Retention (on by default)

Example:
    from jev_client import Jev, boolean, choice, score, pick_with_gap, rank_booleans

    jev = Jev()
    r = jev.evaluate(
        state={"company": "Acme Logistics", "description": "Refrigerated freight, 80 staff"},
        questions={
            "fit": boolean("This company matches: B2B companies in Spain with 20-250 staff."),
            "agency": boolean("This company is an agency or consultancy, not a product or service company."),
        },
    )
    print(r.prob("fit"), jev.usage)

With the native TypeSafe API (direct key) the endpoint is https://api.typesafe.ai/v1/systemone and the "boolean"
type is called "noul" (answer field "noul"). This client understands both response formats.
"""
from __future__ import annotations

import json
import os
import random
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable

PRICE_PER_MILLION_INPUT = 0.042  # USD; output is free
STATE_CHAR_BUDGET = 24_000
RETRYABLE = {408, 429, 500, 502, 503, 504, 529}


# ---------- Question builders ----------

def boolean(instructions: str, true: str | None = None, false: str | None = None) -> dict:
    q: dict[str, Any] = {"type": "boolean", "instructions": instructions}
    if true or false:
        q["criteria"] = {k: v for k, v in (("true", true), ("false", false)) if v}
    return q


def choice(instructions: str, options: dict[str, str | None]) -> dict:
    if not 2 <= len(options) <= 255:
        raise ValueError("Choice accepts 2 to 255 options")
    return {"type": "choice", "instructions": instructions, "criteria": options}


def score(instructions: str, levels: list[str]) -> dict:
    if not 2 <= len(levels) <= 10:
        raise ValueError("Score accepts 2 to 10 levels, lowest to highest")
    return {"type": "score", "instructions": instructions, "criteria": levels}


# ---------- Result ----------

@dataclass
class Result:
    answers: dict
    cost_usd: float
    input_tokens: int
    raw: dict = field(repr=False, default_factory=dict)

    def prob(self, key: str) -> float:
        a = self.answers.get(key) or {}
        return float(a.get("probability", a.get("noul", float("nan"))))

    def choice(self, key: str) -> str | None:
        return (self.answers.get(key) or {}).get("choice")

    def score(self, key: str) -> float | None:
        return (self.answers.get(key) or {}).get("score")

    def confidence(self, key: str) -> float:
        a = self.answers.get(key) or {}
        if "confidence" in a:
            return float(a["confidence"])
        if a.get("type") == "choice":
            return choice_confidence(a.get("probabilities", {}))
        if a.get("type") == "score":
            return score_confidence(a.get("probabilities", {}))
        return abs(2 * self.prob(key) - 1)


class JevError(RuntimeError):
    def __init__(self, status: int, body: str):
        super().__init__(f"Jev HTTP {status}: {body[:500]}")
        self.status = status


class Jev:
    def __init__(self, api_key: str | None = None, model: str | None = None, base_url: str | None = None,
                 zdr: bool | None = None, timeout: float = 30.0, max_retries: int = 3):
        self.api_key = api_key or os.environ.get("AI_GATEWAY_API_KEY")
        if not self.api_key:
            raise RuntimeError("Missing AI_GATEWAY_API_KEY")
        self.model = model or os.environ.get("JEV_MODEL", "typesafe-ai/jev")
        self.base_url = (base_url or os.environ.get("JEV_BASE_URL", "https://ai-gateway.vercel.sh/v1")).rstrip("/")
        self.zdr = (os.environ.get("JEV_ZDR") != "0") if zdr is None else zdr
        self.timeout = timeout
        self.max_retries = max_retries
        self._lock = threading.Lock()
        self.usage = {"calls": 0, "input_tokens": 0, "cost_usd": 0.0, "failures": 0}

    def evaluate(self, state: Any, questions: dict) -> Result:
        if state in (None, "") or not questions:
            raise ValueError("state and questions are required")
        body: dict[str, Any] = {"model": self.model, "state": state, "questions": questions}
        if self.zdr:
            body["providerOptions"] = {"gateway": {"zeroDataRetention": True}}
        data = json.dumps(body).encode()
        for attempt in range(self.max_retries + 1):
            req = urllib.request.Request(
                self.base_url + "/evaluate", data=data, method="POST",
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"})
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    payload = json.loads(resp.read())
                missing = [k for k, q in questions.items() if not _valid(q, (payload.get("answers") or {}).get(k))]
                if missing:  # never decide on missing answers
                    if attempt < self.max_retries:
                        time.sleep(_backoff(attempt))
                        continue
                    self._fail()
                    raise JevError(200, f"incomplete answer for: {', '.join(missing)}")
                return self._track(payload)
            except urllib.error.HTTPError as e:
                text = e.read().decode(errors="replace")
                if e.code not in RETRYABLE or attempt >= self.max_retries:
                    self._fail()
                    raise JevError(e.code, text) from None
                time.sleep(_retry_after(e.headers.get("retry-after")) or _backoff(attempt))
            except (urllib.error.URLError, TimeoutError, OSError):  # includes socket.timeout and ConnectionResetError
                if attempt >= self.max_retries:
                    self._fail()
                    raise
                time.sleep(_backoff(attempt))
        raise RuntimeError("unreachable")

    def evaluate_many(self, items: Iterable[Any], build: Callable[[Any], tuple[Any, dict]],
                      concurrency: int = 3) -> list[Result | Exception]:
        """build(item) -> (state, questions). Results keep input order; errors are returned, not raised."""
        items = list(items)

        def run(item):
            try:
                state, questions = build(item)
                return self.evaluate(state, questions)
            except Exception as exc:  # noqa: BLE001 — returned so one failure does not abort the batch
                return exc

        with ThreadPoolExecutor(max_workers=max(1, concurrency)) as ex:
            return list(ex.map(run, items))

    def _track(self, payload: dict) -> Result:
        u = payload.get("usage") or {}
        tokens = int(u.get("inputTokens", u.get("input_tokens", 0)) or 0)
        try:
            cost = float(payload["providerMetadata"]["gateway"]["cost"])
        except (KeyError, TypeError, ValueError):
            cost = tokens * PRICE_PER_MILLION_INPUT / 1e6
        with self._lock:
            self.usage["calls"] += 1
            self.usage["input_tokens"] += tokens
            self.usage["cost_usd"] += cost
        return Result(answers=payload.get("answers", {}), cost_usd=cost, input_tokens=tokens, raw=payload)

    def _fail(self):
        with self._lock:
            self.usage["failures"] += 1


def _valid(q: dict, a: dict | None) -> bool:
    if not a:
        return False
    if q.get("type") == "choice":
        return isinstance(a.get("choice"), str)
    v = a.get("score") if q.get("type") == "score" else a.get("probability", a.get("noul"))
    return isinstance(v, (int, float)) and v == v


def _retry_after(value: str | None) -> float | None:
    try:
        v = float(value) if value else None
        return v if v is not None and 0 < v < 120 else None
    except ValueError:
        return None


def _backoff(attempt: int) -> float:
    return min(8.0, 0.5 * 2 ** attempt) + random.random() * 0.25


# ---------- Decision rules ----------

def choice_confidence(probabilities: dict) -> float:
    ps = list(probabilities.values())
    n = len(ps)
    if n < 2:
        return 1.0 if ps else 0.0
    return max(0.0, (max(ps) - 1 / n) / (1 - 1 / n))


def score_confidence(probabilities: dict) -> float:
    ps = [probabilities[k] for k in sorted(probabilities, key=lambda k: int(k))]
    n = len(ps)
    if n < 2:
        return 1.0 if ps else 0.0
    m = ps.index(max(ps))
    spread = sum(p * abs(i - m) for i, p in enumerate(ps))
    even = sum(abs(i - (n - 1) / 2) for i in range(n)) / n
    return max(0.0, 1 - spread / even)


def rank_booleans(result: Result, keys: Iterable[str] | None = None) -> list[tuple[str, float]]:
    keys = list(keys) if keys is not None else list(result.answers)
    ranked = [(k, result.prob(k)) for k in keys]
    return sorted([r for r in ranked if r[1] == r[1]], key=lambda r: r[1], reverse=True)


def pick_with_gap(ranked: list[tuple[str, float]], floor: float = 0.6, min_gap: float = 0.15) -> tuple[str | None, str]:
    """The top option wins only if it clears the floor and clearly beats the runner-up."""
    if not ranked:
        return None, "no answers"
    top_key, top_p = ranked[0]
    gap = top_p - ranked[1][1] if len(ranked) > 1 else top_p
    if top_p < floor:
        return None, f"top {top_p:.2f} < floor {floor}"
    if len(ranked) > 1 and gap < min_gap:
        return None, f"gap {gap:.2f} < {min_gap}"
    return top_key, "ok"


def lane(conf: float, high: float = 0.85, low: float = 0.6) -> str:
    return "auto" if conf >= high else "review" if conf >= low else "human"


def truncate(text: str, max_chars: int = STATE_CHAR_BUDGET) -> str:
    return text if len(text) <= max_chars else text[:max_chars]


def estimate_tokens(text: str) -> int:
    return -(-len(text) // 4)  # ~4 characters per token


def estimate_cost_usd(tokens: int) -> float:
    return tokens * PRICE_PER_MILLION_INPUT / 1e6
