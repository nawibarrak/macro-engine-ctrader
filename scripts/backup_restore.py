from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BACKUP_DIR = ROOT / "backups"
EXCLUDED_DIRS = {".git", ".venv", "venv", "env", "node_modules", "dist", "backups", "__pycache__"}


def _excluded(relative: Path) -> bool:
    parts = relative.parts
    if not parts:
        return True
    if any(part in EXCLUDED_DIRS for part in parts):
        return True
    name = relative.name
    if name == ".env" or (name.startswith(".env.") and name != ".env.example"):
        return True
    if relative.as_posix().startswith("data/ctrader_cache/") or name.endswith(".jsonl"):
        return True
    return False


def create_backup(destination: Path | None = None) -> Path:
    backup_dir = destination or DEFAULT_BACKUP_DIR
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    archive_path = backup_dir / f"macro-engine-ctrader-{stamp}.zip"
    manifest = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "repository_root": str(ROOT),
        "note": "Local secrets (.env), VCS metadata, dependencies, and transient cTrader cache are intentionally excluded.",
    }
    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in ROOT.rglob("*"):
            if not path.is_file():
                continue
            relative = path.relative_to(ROOT)
            if _excluded(relative):
                continue
            archive.write(path, arcname=relative.as_posix())
        archive.writestr("BACKUP_MANIFEST.json", json.dumps(manifest, indent=2))
    print(f"Backup created: {archive_path}")
    print("Reminder: .env secrets and data/ctrader_cache are excluded by design.")
    return archive_path


def restore_to_separate_folder(archive_path: Path, destination: Path) -> Path:
    archive_path = archive_path.resolve()
    destination = destination.resolve()
    if not archive_path.is_file():
        raise FileNotFoundError(f"Backup archive not found: {archive_path}")
    if destination.exists() and any(destination.iterdir()):
        raise FileExistsError(f"Restore destination must be empty or not exist: {destination}")
    destination.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive_path, "r") as archive:
        for member in archive.infolist():
            name = PurePosixPath(member.filename)
            if name.is_absolute() or ".." in name.parts:
                raise ValueError(f"Unsafe path in backup archive: {member.filename}")
        archive.extractall(destination)
    print(f"Backup restored to a separate folder: {destination}")
    print("Review this restored copy before replacing any working files; it did not overwrite the current project.")
    return destination


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a local project backup or restore it to a separate folder.")
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("create", help="Create a ZIP backup")
    create.add_argument("--destination", type=Path, default=None)
    restore = sub.add_parser("restore", help="Safely extract a ZIP into a separate folder")
    restore.add_argument("archive", type=Path)
    restore.add_argument("--destination", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "create":
        create_backup(args.destination)
    else:
        restore_to_separate_folder(args.archive, args.destination)


if __name__ == "__main__":
    main()
