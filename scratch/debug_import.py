import sys
import os

# Ensure the workspace is in the path
sys.path.append(os.getcwd())

try:
    from backend.comms_service import get_provider_info
    print("SUCCESS: backend.comms_service imported correctly.")
except ImportError as e:
    print(f"IMPORT_ERROR: {e}")
except Exception as e:
    print(f"ERROR: {e}")
