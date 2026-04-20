import sys
import os

print(f"CWD: {os.getcwd()}")
print("SYS.PATH:")
for p in sys.path:
    print(f"  - {p}")

try:
    import backend.data_provider
    print("SUCCESS: backend.data_provider imported.")
    print(f"Has parse_string_list: {hasattr(backend.data_provider, 'parse_string_list')}")
except Exception as e:
    print(f"ERROR: {e}")
    import traceback
    traceback.print_exc()
