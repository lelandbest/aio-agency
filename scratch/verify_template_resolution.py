
import sys
import os
sys.path.append('d:/AIOCRM/backend')

from media_render_registry import resolve_template

print("Testing RESOLUTION...")
try:
    tpl = resolve_template(None)
    print(f"  None -> {tpl['templateId']} (Composition: {tpl['compositionId']})")
except Exception as e:
    print(f"  None -> FAILED: {e}")

try:
    tpl = resolve_template("aio_916")
    print(f"  aio_916 -> {tpl['templateId']} (Composition: {tpl['compositionId']})")
except Exception as e:
    print(f"  aio_916 -> FAILED: {e}")

try:
    tpl = resolve_template("invalid")
    print(f"  invalid -> {tpl['templateId']}")
except ValueError as e:
    print(f"  invalid -> CAUGHT EXPECTED ERROR: {e}")
except Exception as e:
    print(f"  invalid -> CAUGHT UNEXPECTED ERROR: {e}")

try:
    tpl = resolve_template("aio_11")
    print(f"  aio_11 -> {tpl['templateId']} (Composition: {tpl['compositionId']})")
except Exception as e:
    print(f"  aio_11 -> FAILED: {e}")
