"""Read-only JSON API for the benchmark dashboard (frontend: origin/raaid3-frontend).

Serves MongoDB (agentview.runs/results) in the frontend's BenchmarkRun shape
(src/contracts/benchmark.ts). Zero web-framework deps -- stdlib http.server +
pymongo (already a dependency).

  python3 api.py                       # http://127.0.0.1:8787  (PORT env to change)
  GET /api/benchmark/runs              -> BenchmarkRun[]   (what the dashboard fetches)
  GET /api/benchmark/runs/<id>         -> BenchmarkRun
  GET /api/results                     -> raw aggregate rows (agentview.results)
  GET /api/health                      -> {ok, runs, results}

Frontend swap (benchmarkSource.ts): replace mockBenchmarkSource with
  { listRuns: () => fetch(`${API}/api/benchmark/runs`).then(r=>r.json()),
    getRun: (id) => fetch(`${API}/api/benchmark/runs/${id}`).then(r=>r.json()) }

NOTE: this serves the REAL conditions that were benchmarked --
  prompted_gemini, prompted_claude, mcp_gemini, mcp_claude, trained_av
-- which differ from the frontend's frozen CONDITION_ORDER (raw/markdown/a11y/
stagehand/prompted_av/trained_av). Align the frontend enum/colors to these labels.
"""
from __future__ import annotations

import datetime
import http.server
import json
import os
import socketserver

from envload import load_env

load_env()

from logger import _db

# ---- cost / frontier model, mirrored from costs.py (kept inline so this file is
# self-contained and reads plain Mongo dicts) ----
FRONTIER_RATE = 0.10
CHEAP_RATE = 0.01


def _frontier(doc: dict) -> int:
    translator_on_frontier = 0 if doc.get("model") in ("stub", "trained") else doc.get("translator_tokens", 0)
    return translator_on_frontier + doc.get("agent_tokens", 0)


def _cost(doc: dict) -> float:
    tr_rate = CHEAP_RATE if doc.get("model") in ("stub", "trained") else FRONTIER_RATE
    return doc.get("translator_tokens", 0) / 1e6 * tr_rate + doc.get("agent_tokens", 0) / 1e6 * FRONTIER_RATE


def _cond_label(condition: str, model, agent_model) -> str:
    """Map (condition, translator, agent) -> a stable dashboard condition key."""
    if condition == "mcp":
        return f"mcp_{agent_model}"          # mcp_gemini / mcp_claude
    if condition == "translated":
        return "trained_av" if model == "trained" else f"prompted_{model}"  # prompted_gemini/-claude
    return condition                          # raw / markdown_baseline


def _metrics(doc: dict) -> dict:
    fr = _frontier(doc)
    return {
        "successRate": float(int(bool(doc.get("success")))),  # 0/1; UI averages across tasks
        "steps": doc.get("steps", 0),
        "tokens": fr,                                          # frontier tokens (the comparison metric)
        "latencyMs": doc.get("latency_ms", 0),
        "costUsd": round(_cost(doc), 6),
        "energyWh": round(fr / 3200.0, 2),                    # token-proportional PROXY (not measured)
    }


def _task_meta(task_id: str) -> dict:
    from tasks import TASKS

    t = TASKS.get(task_id)
    return {
        "taskLabel": task_id,
        "site": getattr(t, "site", "") if t else "",
        "goal": getattr(t, "goal", "") if t else "",
    }


def build_run() -> dict:
    """The whole runs collection as one BenchmarkRun (tasks x conditions)."""
    db = _db()
    docs = list(db["runs"].find({}, {"_id": 0})) if db is not None else []
    by_task: dict[str, list] = {}
    for d in docs:
        by_task.setdefault(d.get("task_id", "?"), []).append(d)

    tasks = []
    for tid, ds in sorted(by_task.items()):
        results = [{
            "condition": _cond_label(d.get("condition"), d.get("model"), d.get("agent_model")),
            "runCount": 1,
            "metrics": _metrics(d),
        } for d in ds]
        tasks.append({"taskId": tid, **_task_meta(tid), "results": results})

    return {
        "id": "current",
        "label": "AgentView benchmark (live from MongoDB)",
        "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "trainingStage": "sft",
        "note": "Real conditions: prompted_gemini/-claude, mcp_gemini/-claude, trained_av.",
        "tasks": tasks,
    }


class _Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a) -> None:  # quiet
        pass

    def _send(self, code: int, payload) -> None:
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")  # dashboard dev server is cross-origin
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self._send(204, {})

    def do_GET(self) -> None:
        path = self.path.split("?")[0].rstrip("/")
        try:
            if path in ("/api/health", "/api"):
                db = _db()
                self._send(200, {"ok": db is not None,
                                 "runs": db["runs"].count_documents({}) if db is not None else 0,
                                 "results": db["results"].count_documents({}) if db is not None else 0})
            elif path == "/api/benchmark/runs":
                self._send(200, [build_run()])
            elif path.startswith("/api/benchmark/runs/"):
                run = build_run()
                self._send(200, run if path.endswith(run["id"]) else {})
            elif path == "/api/results":
                db = _db()
                self._send(200, list(db["results"].find({}, {"_id": 0})) if db is not None else [])
            else:
                self._send(404, {"error": f"no route for {path}"})
        except Exception as exc:  # never crash the demo server
            self._send(500, {"error": str(exc)})


def main() -> None:
    port = int(os.getenv("PORT", "8787"))
    with socketserver.ThreadingTCPServer(("127.0.0.1", port), _Handler) as httpd:
        print(f"benchmark API on http://127.0.0.1:{port}  (GET /api/benchmark/runs)")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
