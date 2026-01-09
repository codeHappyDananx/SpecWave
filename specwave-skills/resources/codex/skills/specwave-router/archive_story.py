#!/usr/bin/env python3
"""
Story 归档工具

用法:
  python archive_story.py <story_id>        # 归档指定 Story
  python archive_story.py list              # 列出可归档的 Story
  python archive_story.py --help            # 显示帮助

示例:
  python archive_story.py STORY-000001
  python archive_story.py 000001            # 自动补全前缀
"""

import os
import sys
import shutil
import json
from datetime import datetime
from pathlib import Path


def find_workspace_root():
    """查找 .specwave 工作区根目录"""
    current = Path.cwd()
    while current != current.parent:
        if (current / ".specwave").is_dir():
            return current
        current = current.parent
    return Path.cwd()


def normalize_story_id(story_id: str) -> str:
    """标准化 Story ID，支持简写"""
    if story_id.upper().startswith("STORY-"):
        return story_id.upper()
    # 尝试补全为 STORY-xxxxxx 格式
    try:
        num = int(story_id)
        return f"STORY-{num:06d}"
    except ValueError:
        return story_id.upper()


def find_story_dir(stories_path: Path, story_id: str) -> Path | None:
    """查找匹配的 Story 目录（支持带描述的目录名）"""
    normalized_id = normalize_story_id(story_id)
    for item in stories_path.iterdir():
        if item.is_dir() and item.name.upper().startswith(normalized_id):
            return item
    return None


def list_stories(workspace_root: Path):
    """列出所有可归档的 Story"""
    stories_path = workspace_root / ".specwave" / "workspace" / "stories"
    if not stories_path.exists():
        print("❌ 未找到 stories 目录")
        return

    stories = [d for d in stories_path.iterdir() if d.is_dir()]
    if not stories:
        print("📭 没有可归档的 Story")
        return

    print("📋 可归档的 Story:")
    for story in sorted(stories, key=lambda x: x.name):
        # 检查任务完成状态
        task_file = story / "03-任务.md"
        status = "❓"
        if task_file.exists():
            content = task_file.read_text(encoding="utf-8")
            total = content.count("- [ ]") + content.count("- [x]") + content.count("- [X]")
            done = content.count("- [x]") + content.count("- [X]")
            if total > 0:
                status = f"✅ {done}/{total}" if done == total else f"🔄 {done}/{total}"
        print(f"  {story.name}  {status}")


def archive_story(workspace_root: Path, story_id: str, force: bool = False):
    """归档指定的 Story"""
    stories_path = workspace_root / ".specwave" / "workspace" / "stories"
    archive_path = workspace_root / ".specwave" / "workspace" / "archive"

    # 查找 Story 目录
    story_dir = find_story_dir(stories_path, story_id)
    if not story_dir:
        print(f"❌ 未找到 Story: {story_id}")
        print("💡 使用 'python archive_story.py list' 查看可归档的 Story")
        sys.exit(1)

    # 检查任务完成状态
    task_file = story_dir / "03-任务.md"
    if task_file.exists() and not force:
        content = task_file.read_text(encoding="utf-8")
        unchecked = content.count("- [ ]")
        if unchecked > 0:
            print(f"⚠️  Story 还有 {unchecked} 个未完成的任务")
            print("💡 使用 --force 强制归档，或先完成所有任务")
            sys.exit(1)

    # 创建归档目录
    archive_path.mkdir(parents=True, exist_ok=True)

    # 移动 Story 目录
    target_dir = archive_path / story_dir.name
    if target_dir.exists():
        print(f"❌ 归档目录已存在: {target_dir.name}")
        sys.exit(1)

    shutil.move(str(story_dir), str(target_dir))

    # 记录归档时间
    archive_meta = target_dir / ".archive_meta.json"
    archive_meta.write_text(
        json.dumps({
            "archived_at": datetime.now().isoformat(),
            "original_path": str(story_dir.relative_to(workspace_root))
        }, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    print(f"✅ 已归档: {story_dir.name}")
    print(f"   → {target_dir.relative_to(workspace_root)}")


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("--help", "-h"):
        print(__doc__)
        sys.exit(0)

    workspace_root = find_workspace_root()
    command = sys.argv[1]

    if command == "list":
        list_stories(workspace_root)
    else:
        force = "--force" in sys.argv or "-f" in sys.argv
        archive_story(workspace_root, command, force)


if __name__ == "__main__":
    main()
