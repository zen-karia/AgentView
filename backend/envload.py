"""Tiny zero-dependency .env loader (no python-dotenv needed).

Reads backend/.env (KEY=VALUE lines) into os.environ. A real exported env var always
wins -- we only fill what's missing (setdefault). Entry points call load_env() first.
"""
from __future__ import annotations

import os
import pathlib


def load_env(path: str | None = None) -> None:
    p = pathlib.Path(path) if path else pathlib.Path(__file__).parent / ".env"
    if not p.exists():
        return
    for line in p.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            os.environ.setdefault(key, value)  # exported env wins over .env
