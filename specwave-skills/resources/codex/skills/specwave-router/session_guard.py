#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Optional, Tuple


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _norm_path(p: str) -> str:
    return os.path.normcase(os.path.normpath(p))


def _default_sessions_roots() -> list[Path]:
    roots: list[Path] = []

    env_codex_home = os.environ.get("CODEX_HOME", "").strip()
    if env_codex_home:
        roots.append(Path(env_codex_home).expanduser().resolve() / "sessions")

    user_profile = os.environ.get("USERPROFILE", "").strip()
    if user_profile:
        roots.append(Path(user_profile).expanduser().resolve() / ".codex" / "sessions")

    roots.append(Path.home().expanduser().resolve() / ".codex" / "sessions")

    dedup: list[Path] = []
    seen: set[str] = set()
    for root in roots:
        key = str(root)
        if key in seen:
            continue
        seen.add(key)
        dedup.append(root)
    return dedup


def _read_first_json_line(path: Path) -> Optional[dict[str, Any]]:
    try:
        with path.open("r", encoding="utf-8", errors="replace") as f:
            line = f.readline()
        if not line:
            return None
        return json.loads(line)
    except Exception:
        return None


@dataclass(frozen=True)
class SessionCandidate:
    session_id: str
    cwd: str
    rollout_path: Path
    mtime: float


def _iter_rollout_files(sessions_root: Path) -> Iterable[Path]:
    if not sessions_root.exists():
        return []
    # sessions 目录可能很大：只在遍历过程中保留最近的若干条，避免全量解析。
    return sessions_root.rglob("rollout-*.jsonl")


def _pick_recent_files(paths: Iterable[Path], limit: int) -> list[Tuple[float, Path]]:
    items: list[Tuple[float, Path]] = []
    for p in paths:
        try:
            st = p.stat()
            items.append((st.st_mtime, p))
        except Exception:
            continue
    items.sort(key=lambda x: x[0], reverse=True)
    return items[: max(1, limit)]


def _find_candidates(
    sessions_root: Path, project_root: Path, recent_limit: int
) -> list[SessionCandidate]:
    project_norm = _norm_path(str(project_root))
    candidates: list[SessionCandidate] = []
    recent = _pick_recent_files(_iter_rollout_files(sessions_root), recent_limit)
    for mtime, p in recent:
        obj = _read_first_json_line(p)
        if not obj or obj.get("type") != "session_meta":
            continue
        payload = obj.get("payload") or {}
        sid = str(payload.get("id") or "").strip()
        cwd = str(payload.get("cwd") or "").strip()
        if not sid or not cwd:
            continue
        if _norm_path(cwd) != project_norm:
            continue
        candidates.append(SessionCandidate(session_id=sid, cwd=cwd, rollout_path=p, mtime=mtime))
    candidates.sort(key=lambda c: c.mtime, reverse=True)
    return candidates


def resolve_session_id(
    project_root: Path,
    sessions_root: Optional[Path],
    explicit_session_id: Optional[str],
    recent_limit: int,
    ambiguity_seconds: float,
) -> Tuple[str, Path, list[SessionCandidate]]:
    if explicit_session_id:
        roots = [sessions_root] if sessions_root else _default_sessions_roots()
        root = next((r for r in roots if r and r.exists()), roots[0] if roots else Path.home())
        return explicit_session_id, root, []

    roots = [sessions_root] if sessions_root else _default_sessions_roots()
    chosen_root = None
    all_candidates: list[SessionCandidate] = []
    for root in roots:
        if not root or not root.exists():
            continue
        chosen_root = root
        all_candidates = _find_candidates(root, project_root, recent_limit=recent_limit)
        if all_candidates:
            break

    if not chosen_root:
        chosen_root = roots[0] if roots else Path.home()

    if not all_candidates:
        raise RuntimeError(
            "没找到当前项目的 Codex 会话日志。请确认：已在该项目目录下启动过 Codex，会话日志目录可读。"
        )

    if len(all_candidates) >= 2 and abs(all_candidates[0].mtime - all_candidates[1].mtime) <= ambiguity_seconds:
        raise RuntimeError(
            "同项目存在多个活跃会话，无法自动绑定。请用 --session-id 显式指定。"
        )

    return all_candidates[0].session_id, chosen_root, all_candidates


def _load_settings(settings_path: Path) -> dict[str, Any]:
    if not settings_path.exists():
        raise RuntimeError(f"找不到 settings.json：{settings_path}")
    try:
        raw = settings_path.read_text(encoding="utf-8")
        obj = json.loads(raw)
        if not isinstance(obj, dict):
            raise RuntimeError("settings.json 不是 JSON 对象")
        return obj
    except json.JSONDecodeError as e:
        raise RuntimeError(f"settings.json JSON 解析失败：{e}") from e


def _atomic_write_json(path: Path, obj: dict[str, Any]) -> None:
    content = json.dumps(obj, ensure_ascii=False, indent=2) + "\n"
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(content, encoding="utf-8")
    tmp.replace(path)


def _ensure_session_store(settings: dict[str, Any]) -> dict[str, Any]:
    store = settings.get("sessionStore")
    if not isinstance(store, dict):
        store = {"version": 1, "bySessionId": {}, "legacy": {}}
        settings["sessionStore"] = store
        return store

    if not isinstance(store.get("bySessionId"), dict):
        store["bySessionId"] = {}
    if "version" not in store:
        store["version"] = 1
    if not isinstance(store.get("legacy"), dict):
        store["legacy"] = {}
    return store


def cmd_status(args: argparse.Namespace) -> int:
    project_root = Path(args.project_root).resolve()
    settings_path = project_root / ".specwave" / "settings.json"
    sessions_root = Path(args.sessions_root).resolve() if args.sessions_root else None

    try:
        sid, used_sessions_root, candidates = resolve_session_id(
            project_root=project_root,
            sessions_root=sessions_root,
            explicit_session_id=args.session_id,
            recent_limit=args.recent_limit,
            ambiguity_seconds=args.ambiguity_seconds,
        )
        print(f"project_root: {project_root}")
        print(f"settings: {settings_path}")
        print(f"sessions_root: {used_sessions_root}")
        print(f"session_id: {sid}")
        if candidates:
            print(f"candidates: {len(candidates)} (showing up to 3)")
            for c in candidates[:3]:
                print(f"- {c.session_id}  mtime={int(c.mtime)}  {c.rollout_path}")
        return 0
    except Exception as e:
        print(f"status: FAILED: {e}", file=sys.stderr)
        return 2


def cmd_sync(args: argparse.Namespace) -> int:
    project_root = Path(args.project_root).resolve()
    settings_path = project_root / ".specwave" / "settings.json"
    sessions_root = Path(args.sessions_root).resolve() if args.sessions_root else None

    sid, _, _ = resolve_session_id(
        project_root=project_root,
        sessions_root=sessions_root,
        explicit_session_id=args.session_id,
        recent_limit=args.recent_limit,
        ambiguity_seconds=args.ambiguity_seconds,
    )

    settings = _load_settings(settings_path)
    store = _ensure_session_store(settings)

    # 迁移旧的全局 currentSession：只收容到 legacy，避免影响其他会话。
    if settings.get("currentSession") is not None:
        legacy = store.get("legacy")
        if isinstance(legacy, dict) and "globalCurrentSession" not in legacy:
            legacy["globalCurrentSession"] = settings.get("currentSession")
        settings["currentSession"] = None

    by_sid: dict[str, Any] = store["bySessionId"]
    bucket = by_sid.get(sid)
    if not isinstance(bucket, dict):
        bucket = {"currentSession": None, "updatedAt": _now_iso()}
        by_sid[sid] = bucket

    # currentSession 仅作为“当前会话投影”
    settings["currentSession"] = bucket.get("currentSession")
    bucket["updatedAt"] = _now_iso()

    _atomic_write_json(settings_path, settings)
    print(f"sync: OK  session_id={sid}")
    return 0


def cmd_set(args: argparse.Namespace) -> int:
    project_root = Path(args.project_root).resolve()
    settings_path = project_root / ".specwave" / "settings.json"
    sessions_root = Path(args.sessions_root).resolve() if args.sessions_root else None

    sid, _, _ = resolve_session_id(
        project_root=project_root,
        sessions_root=sessions_root,
        explicit_session_id=args.session_id,
        recent_limit=args.recent_limit,
        ambiguity_seconds=args.ambiguity_seconds,
    )

    settings = _load_settings(settings_path)
    store = _ensure_session_store(settings)
    by_sid: dict[str, Any] = store["bySessionId"]
    bucket = by_sid.get(sid)
    if not isinstance(bucket, dict):
        bucket = {"currentSession": None}
        by_sid[sid] = bucket

    current = {
        "mode": args.mode,
        "storyId": args.story,
        "phase": args.phase,
        "createdAt": _now_iso(),
    }

    bucket["currentSession"] = current
    bucket["updatedAt"] = _now_iso()
    settings["currentSession"] = current

    _atomic_write_json(settings_path, settings)
    print(f"set: OK  session_id={sid}  story={args.story}  phase={args.phase}")
    return 0


def cmd_clear(args: argparse.Namespace) -> int:
    project_root = Path(args.project_root).resolve()
    settings_path = project_root / ".specwave" / "settings.json"
    sessions_root = Path(args.sessions_root).resolve() if args.sessions_root else None

    sid, _, _ = resolve_session_id(
        project_root=project_root,
        sessions_root=sessions_root,
        explicit_session_id=args.session_id,
        recent_limit=args.recent_limit,
        ambiguity_seconds=args.ambiguity_seconds,
    )

    settings = _load_settings(settings_path)
    store = _ensure_session_store(settings)
    by_sid: dict[str, Any] = store["bySessionId"]
    bucket = by_sid.get(sid)
    if not isinstance(bucket, dict):
        bucket = {}
        by_sid[sid] = bucket
    bucket["currentSession"] = None
    bucket["updatedAt"] = _now_iso()
    settings["currentSession"] = None

    _atomic_write_json(settings_path, settings)
    print(f"clear: OK  session_id={sid}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="session_guard.py", add_help=True)
    parser.add_argument(
        "--project-root",
        default=".",
        help="项目根目录（默认当前目录）",
    )
    parser.add_argument(
        "--sessions-root",
        default=None,
        help="Codex sessions 根目录（默认自动探测）",
    )
    parser.add_argument(
        "--session-id",
        default=None,
        help="显式指定 session id（并发时建议使用）",
    )
    parser.add_argument(
        "--recent-limit",
        type=int,
        default=500,
        help="只扫描最近的 rollout 数量（默认 500）",
    )
    parser.add_argument(
        "--ambiguity-seconds",
        type=float,
        default=3.0,
        help="并发判定阈值（秒），默认 3 秒",
    )

    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("status", help="打印当前会话识别结果").set_defaults(func=cmd_status)
    sub.add_parser("sync", help="对齐当前会话投影并迁移旧结构").set_defaults(func=cmd_sync)

    set_p = sub.add_parser("set", help="设置当前会话的 currentSession")
    set_p.add_argument("--mode", required=True, choices=["spec"], help="会话模式（当前仅支持 spec）")
    set_p.add_argument("--story", required=True, help="Story ID（如 STORY-000010）")
    set_p.add_argument("--phase", required=True, help="阶段（如 诉求对齐/需求编写/设计方案/任务拆解/执行）")
    set_p.set_defaults(func=cmd_set)

    sub.add_parser("clear", help="清空当前会话的 currentSession").set_defaults(func=cmd_clear)

    args = parser.parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())

