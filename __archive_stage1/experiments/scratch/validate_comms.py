import sys
import os

# Set PYTHONPATH
sys.path.append(os.getcwd())

try:
    from backend.comms_service import (
        list_provider_configs,
        get_provider_info,
        get_comms_overview,
        list_phone_numbers,
        list_sms_threads,
        list_call_sessions,
        get_routes_for_ui
    )
    
    print("IMPORT: PASS")
    
    tasks = {
        "list_provider_configs": list_provider_configs,
        "get_provider_info": get_provider_info,
        "get_comms_overview": get_comms_overview,
        "list_phone_numbers": list_phone_numbers,
        "list_sms_threads": list_sms_threads,
        "list_call_sessions": list_call_sessions,
        "get_routes_for_ui": get_routes_for_ui
    }
    
    for name, func in tasks.items():
        try:
            # Calling them. They use sqlite, so they should work if DB and structure are okay.
            func() 
            print(f"{name}: PASS")
        except Exception as e:
            print(f"{name}: FAIL - {e}")

except ImportError as e:
    print(f"IMPORT: FAIL - {e}")
except Exception as e:
    print(f"ERROR: {e}")
