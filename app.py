from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, render_template, request

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "serious_ops.sqlite3"

app = Flask(__name__)


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript(
            """
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS operators (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                alias TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS simulation_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                operator_id INTEGER NOT NULL,
                scenario TEXT NOT NULL,
                started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                ended_at TEXT,
                result TEXT,
                total_score INTEGER NOT NULL DEFAULT 0,
                deliveries INTEGER NOT NULL DEFAULT 0,
                incidents INTEGER NOT NULL DEFAULT 0,
                avg_risk REAL NOT NULL DEFAULT 0,
                efficiency REAL NOT NULL DEFAULT 0,
                FOREIGN KEY(operator_id) REFERENCES operators(id)
            );

            CREATE TABLE IF NOT EXISTS simulation_decisions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                frame_no INTEGER NOT NULL,
                decision TEXT NOT NULL,
                score_delta INTEGER NOT NULL DEFAULT 0,
                risk_level REAL NOT NULL DEFAULT 0,
                payload_json TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(session_id) REFERENCES simulation_sessions(id)
            );

            CREATE TABLE IF NOT EXISTS simulation_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                event_type TEXT NOT NULL,
                event_value INTEGER NOT NULL DEFAULT 0,
                payload_json TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(session_id) REFERENCES simulation_sessions(id)
            );
            """
        )


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {k: row[k] for k in row.keys()}


@app.route("/")
def index() -> str:
    return render_template("index.html")


@app.route("/api/health")
def health():
    return jsonify({"ok": True, "db": DB_PATH.name})


@app.route("/api/operator/register", methods=["POST"])
def register_operator():
    payload = request.get_json(silent=True) or {}
    alias = str(payload.get("alias", "")).strip()[:40]

    if len(alias) < 3:
        return jsonify({"ok": False, "error": "Alias demasiado corto"}), 400

    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO operators(alias) VALUES(?)
            ON CONFLICT(alias) DO UPDATE SET last_seen=CURRENT_TIMESTAMP
            """,
            (alias,),
        )
        row = conn.execute(
            "SELECT id, alias, created_at, last_seen FROM operators WHERE alias = ?",
            (alias,),
        ).fetchone()

    return jsonify({"ok": True, "operator": row_to_dict(row)})


@app.route("/api/session/start", methods=["POST"])
def start_session():
    payload = request.get_json(silent=True) or {}
    operator_id = int(payload.get("operator_id", 0))
    scenario = str(payload.get("scenario", "urban-logistics")).strip()[:40] or "urban-logistics"

    if operator_id <= 0:
        return jsonify({"ok": False, "error": "operator_id inválido"}), 400

    with get_conn() as conn:
        op = conn.execute("SELECT id FROM operators WHERE id=?", (operator_id,)).fetchone()
        if op is None:
            return jsonify({"ok": False, "error": "Operador no encontrado"}), 404

        cur = conn.execute(
            "INSERT INTO simulation_sessions(operator_id, scenario) VALUES(?,?)",
            (operator_id, scenario),
        )
        sid = cur.lastrowid

    return jsonify({"ok": True, "session_id": sid})


@app.route("/api/session/decision", methods=["POST"])
def save_decision():
    payload = request.get_json(silent=True) or {}
    session_id = int(payload.get("session_id", 0))
    frame_no = int(payload.get("frame_no", 0))
    decision = str(payload.get("decision", "hold")).strip()[:40]
    score_delta = int(payload.get("score_delta", 0))
    risk_level = float(payload.get("risk_level", 0))
    extra = payload.get("payload", {})

    if session_id <= 0 or frame_no <= 0:
        return jsonify({"ok": False, "error": "Datos de decisión inválidos"}), 400

    with get_conn() as conn:
        exists = conn.execute("SELECT id FROM simulation_sessions WHERE id=?", (session_id,)).fetchone()
        if exists is None:
            return jsonify({"ok": False, "error": "Sesión no encontrada"}), 404

        conn.execute(
            """
            INSERT INTO simulation_decisions(session_id, frame_no, decision, score_delta, risk_level, payload_json)
            VALUES(?,?,?,?,?,?)
            """,
            (session_id, frame_no, decision, score_delta, risk_level, json.dumps(extra, ensure_ascii=False)),
        )

    return jsonify({"ok": True})


@app.route("/api/session/event", methods=["POST"])
def save_event():
    payload = request.get_json(silent=True) or {}
    session_id = int(payload.get("session_id", 0))
    event_type = str(payload.get("event_type", "")).strip()[:40]
    event_value = int(payload.get("event_value", 0))
    extra = payload.get("payload", {})

    if session_id <= 0 or not event_type:
        return jsonify({"ok": False, "error": "Evento inválido"}), 400

    with get_conn() as conn:
        exists = conn.execute("SELECT id FROM simulation_sessions WHERE id=?", (session_id,)).fetchone()
        if exists is None:
            return jsonify({"ok": False, "error": "Sesión no encontrada"}), 404

        conn.execute(
            """
            INSERT INTO simulation_events(session_id, event_type, event_value, payload_json)
            VALUES(?,?,?,?)
            """,
            (session_id, event_type, event_value, json.dumps(extra, ensure_ascii=False)),
        )

    return jsonify({"ok": True})


@app.route("/api/session/end", methods=["POST"])
def end_session():
    payload = request.get_json(silent=True) or {}
    sid = int(payload.get("session_id", 0))
    result = str(payload.get("result", "pending")).strip()[:20]
    total_score = int(payload.get("total_score", 0))
    deliveries = int(payload.get("deliveries", 0))
    incidents = int(payload.get("incidents", 0))
    avg_risk = float(payload.get("avg_risk", 0.0))
    efficiency = float(payload.get("efficiency", 0.0))

    if sid <= 0:
        return jsonify({"ok": False, "error": "session_id inválido"}), 400

    with get_conn() as conn:
        exists = conn.execute("SELECT id FROM simulation_sessions WHERE id=?", (sid,)).fetchone()
        if exists is None:
            return jsonify({"ok": False, "error": "Sesión no encontrada"}), 404

        conn.execute(
            """
            UPDATE simulation_sessions
               SET ended_at=CURRENT_TIMESTAMP,
                   result=?,
                   total_score=?,
                   deliveries=?,
                   incidents=?,
                   avg_risk=?,
                   efficiency=?
             WHERE id=?
            """,
            (result, total_score, deliveries, incidents, avg_risk, efficiency, sid),
        )

    return jsonify({"ok": True})


@app.route("/api/leaderboard")
def leaderboard():
    limit = max(5, min(int(request.args.get("limit", 12)), 50))

    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT s.id,
                   o.alias,
                   s.scenario,
                   s.result,
                   s.total_score,
                   s.deliveries,
                   s.incidents,
                   s.avg_risk,
                   s.efficiency,
                   s.ended_at
              FROM simulation_sessions s
              JOIN operators o ON o.id = s.operator_id
             WHERE s.ended_at IS NOT NULL
             ORDER BY s.total_score DESC, s.efficiency DESC
             LIMIT ?
            """,
            (limit,),
        ).fetchall()

    return jsonify({"ok": True, "items": [row_to_dict(r) for r in rows]})


@app.route("/api/operator/<int:operator_id>/history")
def operator_history(operator_id: int):
    limit = max(5, min(int(request.args.get("limit", 10)), 40))

    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, scenario, result, total_score, deliveries, incidents,
                   avg_risk, efficiency, started_at, ended_at
              FROM simulation_sessions
             WHERE operator_id = ?
             ORDER BY id DESC
             LIMIT ?
            """,
            (operator_id, limit),
        ).fetchall()

    return jsonify({"ok": True, "items": [row_to_dict(r) for r in rows]})


@app.route("/api/stats")
def stats():
    with get_conn() as conn:
        operators = conn.execute("SELECT COUNT(*) AS c FROM operators").fetchone()["c"]
        sessions = conn.execute("SELECT COUNT(*) AS c FROM simulation_sessions").fetchone()["c"]
        decisions = conn.execute("SELECT COUNT(*) AS c FROM simulation_decisions").fetchone()["c"]
        events = conn.execute("SELECT COUNT(*) AS c FROM simulation_events").fetchone()["c"]

    return jsonify(
        {
            "ok": True,
            "operators": operators,
            "sessions": sessions,
            "decisions": decisions,
            "events": events,
        }
    )


if __name__ == "__main__":
    init_db()
    app.run(host="127.0.0.1", port=5091, debug=True)
