"""Retry helper for Gemini free-tier rate limits (per-minute 429s).

The free tier allows only a few requests/minute. Rather than die on a 429, wait
the suggested delay and retry a few times. Real (funded) keys rarely hit this.
"""
from __future__ import annotations

import re
import time


def with_retry(fn, tries: int = 4):
    for attempt in range(tries):
        try:
            return fn()
        except Exception as exc:  # SDK-specific error types vary; match on message
            msg = str(exc)
            # A daily cap won't clear by waiting -- fail fast so we don't burn the
            # remaining allowance hammering it. Only per-minute limits are worth a wait.
            per_day = "PerDay" in msg or "RequestsPerDay" in msg
            transient = ("429" in msg or "RESOURCE_EXHAUSTED" in msg) and not per_day
            if not transient or attempt == tries - 1:
                raise
            m = re.search(r"retry in ([0-9.]+)s", msg) or re.search(r"retryDelay': '([0-9]+)s", msg)
            delay = float(m.group(1)) if m else 5 * (attempt + 1)
            print(f"[gemini] rate-limited, waiting {delay:.0f}s (attempt {attempt + 1}/{tries})")
            time.sleep(min(delay + 1, 45))
    raise RuntimeError("unreachable")
