"""
AIO Nexus — Storage Location & Data Relocation Manager
Supports arbitrary data drive relocation so users can store their database and media
on secondary hard drives, external SSDs, or custom portable directories.
"""

from __future__ import annotations

import json
import os
import shutil
from pathlib import Path
from typing import Any

CONFIG_FILE_NAME = "storage.json"


def _find_app_root() -> Path:
    current = Path(__file__).resolve().parent
    for _ in range(5):
        if (current / "backend").exists() or (current / "tauri.conf.json").exists() or (current / "frontend").exists():
            return current
        if current.parent == current:
            break
        current = current.parent
    return Path(__file__).resolve().parent.parent


def get_storage_config_file() -> Path:
    root = _find_app_root()
    return root / CONFIG_FILE_NAME


def get_custom_data_path() -> Path | None:
    # 1. Check storage.json in app root
    cfg_file = get_storage_config_file()
    if cfg_file.exists():
        try:
            data = json.loads(cfg_file.read_text(encoding="utf-8"))
            custom_path = data.get("dataPath") or data.get("data_dir")
            if custom_path:
                p = Path(custom_path).resolve()
                return p
        except Exception:
            pass

    # 2. Check environment variable override
    env_dir = os.getenv("MEDIA_DATA_DIR")
    if env_dir:
        p = Path(env_dir).resolve()
        if p.exists() or p.parent.exists():
            return p

    sql_env = os.getenv("SQLITE_DB_PATH")
    if sql_env:
        p = Path(sql_env).resolve().parent
        if p.exists() or p.parent.exists():
            return p

    return None


def resolve_data_directory() -> Path:
    custom = get_custom_data_path()
    if custom:
        return custom
    root = _find_app_root()
    return root / "data"


def get_storage_info() -> dict[str, Any]:
    data_dir = resolve_data_directory()
    data_dir.mkdir(parents=True, exist_ok=True)

    total_bytes = 0
    file_count = 0
    try:
        for entry in data_dir.rglob("*"):
            if entry.is_file():
                total_bytes += entry.stat().st_size
                file_count += 1
    except Exception:
        pass

    disk_total = 0
    disk_free = 0
    try:
        usage = shutil.disk_usage(str(data_dir))
        disk_total = usage.total
        disk_free = usage.free
    except Exception:
        pass

    return {
        "currentPath": str(data_dir),
        "isCustom": get_custom_data_path() is not None,
        "totalAssetSizeBytes": total_bytes,
        "totalFiles": file_count,
        "diskTotalBytes": disk_total,
        "diskFreeBytes": disk_free,
        "configFile": str(get_storage_config_file()),
    }


def relocate_storage(new_path_str: str, move_existing: bool = True) -> dict[str, Any]:
    new_path = Path(new_path_str.strip()).resolve()
    old_path = resolve_data_directory()

    if new_path == old_path:
        return {"success": True, "path": str(new_path), "message": "Path is already active."}

    new_path.mkdir(parents=True, exist_ok=True)
    for sub in ["audio", "video", "image", "voice", "doc"]:
        (new_path / sub).mkdir(parents=True, exist_ok=True)

    copied_files = 0
    if move_existing and old_path.exists():
        try:
            for item in old_path.iterdir():
                dest = new_path / item.name
                if item.is_file():
                    shutil.copy2(item, dest)
                    copied_files += 1
                elif item.is_dir():
                    shutil.copytree(item, dest, dirs_exist_ok=True)
        except Exception as e:
            raise ValueError(f"Failed to copy existing data to new storage location: {e}")

    # Write storage.json
    cfg_file = get_storage_config_file()
    cfg_data = {"dataPath": str(new_path)}
    cfg_file.write_text(json.dumps(cfg_data, indent=2), encoding="utf-8")

    # Update environment variables for active process
    os.environ["MEDIA_DATA_DIR"] = str(new_path)
    os.environ["SQLITE_DB_PATH"] = str(new_path / "aio_crm.db")
    os.environ["AUTH_DB_PATH"] = str(new_path / "aio_crm.db")

    return {
        "success": True,
        "previousPath": str(old_path),
        "newPath": str(new_path),
        "filesCopied": copied_files,
        "message": f"Storage successfully relocated to {new_path}.",
    }
