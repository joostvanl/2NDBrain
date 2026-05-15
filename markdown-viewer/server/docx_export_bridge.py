# -*- coding: utf-8 -*-
"""Bridge voor de Node-server: lees JSON van stdin, schrijf één JSON-regel naar stdout.

Verwachte omgevingsvariabelen (door Node gezet): TEMPLATES_DIR, OUTPUT_DIR.
PYTHONPATH moet naar LLM2DOCX/src wijzen zodat ``word_generator_mcp`` importeerbaar is.
"""

from __future__ import annotations

import json
import sys
from typing import Any


def main() -> None:
    try:
        raw = sys.stdin.read()
        data: dict[str, Any] = json.loads(raw) if raw.strip() else {}
        markdown_content = str(data.get("markdown_content", ""))
        template_name = str(data.get("template_name", ""))
        metadata = data.get("metadata_dict")
        if not isinstance(metadata, dict):
            metadata = {}
        out_fn = str(data.get("output_filename") or "").strip()
        if not out_fn:
            print(json.dumps({"ok": False, "error": "output_filename ontbreekt"}), flush=True)
            sys.exit(1)
        from word_generator_mcp.generate import generate_document_to_path

        path = generate_document_to_path(
            markdown_content,
            template_name,
            metadata,
            out_fn,
        )
        print(json.dumps({"ok": True, "path": str(path)}), flush=True)
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}), flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
