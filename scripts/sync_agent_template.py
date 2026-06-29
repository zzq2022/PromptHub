#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Agent Template Sync Script

This script copies the text-to-sql agent from D:\\Pyprojects\\Tpa_RuYiBot (or any other location)
to apps/desktop/resources/agent-template/ in PromptHub, while:
1. Stripping all sensitive API keys from config.json.
2. Ignoring virtual environments, caches, local logs, sessions, memory files, and binaries.
3. Keeping the skills, sessions, memory, and logs directories empty with a .gitkeep file.
"""

import argparse
import json
import os
import shutil
import sys
from pathlib import Path

# Resolve PromptHub root directory (parent of scripts/)
PROMPTHUB_ROOT = Path(__file__).resolve().parent.parent


def get_default_src() -> Path | None:
    candidates = [
        Path("D:/Pyprojects/Tpa_RuYiBot"),
        PROMPTHUB_ROOT.parent / "Tpa_RuYiBot"
    ]
    for c in candidates:
        if c.exists() and (c / "agent.py").exists():
            return c
    return None


def sanitize_config(data: any) -> None:
    """Recursively search for and sanitize keys containing 'api_key' or 'secret'."""
    if isinstance(data, dict):
        for k, v in list(data.items()):
            if "api_key" in k.lower() or "secret" in k.lower():
                data[k] = "YOUR_API_KEY_HERE"
            else:
                sanitize_config(v)
    elif isinstance(data, list):
        for item in data:
            sanitize_config(item)


def copy_dir_filtered(src: Path, dst: Path) -> None:
    """Copy a directory recursively, skipping __pycache__, .venv, .git, etc."""
    dst.mkdir(parents=True, exist_ok=True)
    for item in src.iterdir():
        # Exclude common dev/runtime noise
        if item.name in [
            "__pycache__", ".venv", ".git", ".idea", ".claude",
            "node_modules", "dist", "build"
        ]:
            continue
        if item.suffix in [".pyc", ".pyo", ".pyd", ".log", ".tmp", ".db"]:
            continue
        
        target = dst / item.name
        if item.is_dir():
            copy_dir_filtered(item, target)
        else:
            shutil.copy2(item, target)


def main():
    parser = argparse.ArgumentParser(description="Sync Agent Template from Tpa_RuYiBot")
    parser.add_argument("--src", type=str, help="Path to Tpa_RuYiBot project directory")
    parser.add_argument(
        "--dst",
        type=str,
        default=str(PROMPTHUB_ROOT / "apps" / "desktop" / "resources" / "agent-template"),
        help="Path to the destination agent-template directory"
    )
    args = parser.parse_args()

    # Determine source directory
    src_path = Path(args.src) if args.src else get_default_src()
    if not src_path:
        print("Error: Could not find Tpa_RuYiBot source directory.")
        print("Please specify it manually using the --src option.")
        sys.exit(1)

    src_path = src_path.resolve()
    dst_path = Path(args.dst).resolve()

    print(f"Source:      {src_path}")
    print(f"Destination: {dst_path}")
    print("-" * 50)

    if not src_path.exists():
        print(f"Error: Source path '{src_path}' does not exist.")
        sys.exit(1)

    # 1. Clean destination except for protected directories
    if dst_path.exists():
        print("Cleaning destination directory...")
        # Clean subdirs/files instead of shutil.rmtree to preserve destination container if needed
        for item in dst_path.iterdir():
            if item.is_dir():
                shutil.rmtree(item)
            else:
                item.unlink()
    else:
        dst_path.mkdir(parents=True, exist_ok=True)

    # 2. Copy root files
    root_files_to_copy = [
        "agent.py",
        "run_gateway.py",
        "stop_gateway.py",
        "AGENTS.md",
        "HEARTBEAT.md",
        "SOUL.md",
        "TOOLS.md",
        "USER.md",
        ".gitignore"
    ]
    for file_name in root_files_to_copy:
        src_file = src_path / file_name
        if src_file.exists():
            print(f"Copying root file: {file_name}")
            shutil.copy2(src_file, dst_path / file_name)
        else:
            print(f"Warning: Root file '{file_name}' not found in source.")

    # 3. Copy directories
    dirs_to_copy = ["libs", "backend"]
    for dir_name in dirs_to_copy:
        src_dir = src_path / dir_name
        if src_dir.exists():
            print(f"Copying directory: {dir_name}/")
            copy_dir_filtered(src_dir, dst_path / dir_name)
        else:
            print(f"Warning: Directory '{dir_name}' not found in source.")

    # 4. Create empty directories with .gitkeep
    empty_dirs = ["skills", "sessions", "memory", "logs"]
    for dir_name in empty_dirs:
        target_dir = dst_path / dir_name
        target_dir.mkdir(parents=True, exist_ok=True)
        # Write .gitkeep
        (target_dir / ".gitkeep").touch()
        print(f"Prepared empty directory with .gitkeep: {dir_name}/")

    # 5. Sanitize config.json
    src_config = src_path / "config.json"
    dst_config = dst_path / "config.json"
    if src_config.exists():
        print("Sanitizing config.json...")
        try:
            with open(src_config, "r", encoding="utf-8") as f:
                config_data = json.load(f)
            
            sanitize_config(config_data)
            
            with open(dst_config, "w", encoding="utf-8") as f:
                json.dump(config_data, f, indent=2, ensure_ascii=False)
            print("Successfully written sanitized config.json")
        except Exception as e:
            print(f"Error sanitizing config.json: {e}")
            sys.exit(1)
    else:
        print("Warning: config.json not found in source.")

    print("-" * 50)
    print("Sync complete successfully!")


if __name__ == "__main__":
    main()
