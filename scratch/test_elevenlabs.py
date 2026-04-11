
import sys
import os

sys.path.append('d:/AIOCRM')
sys.path.append('d:/AIOCRM/backend')

from backend.vtt_service import synthesize_voice
import logging

# We want to see errors
logging.basicConfig(level=logging.INFO)

try:
    print("Testing ElevenLabs Synthesis with tenant-primary...")
    url = synthesize_voice("This is a targeted re-validation test.", voice="adam", tenant_id="tenant-primary")
    if url:
        print(f"SUCCESS: Audio generated at {url}")
        filename = url.split('/')[-1]
        filepath = os.path.join('d:/AIOCRM/backend/data/audio', filename)
        if os.path.exists(filepath):
            size = os.path.getsize(filepath)
            print(f"File exists: {filepath} ({size} bytes)")
        else:
            print(f"File NOT found locally at {filepath}")
    else:
        print("FAILURE: synthesize_voice returned None")
except Exception as e:
    print(f"CRASH: {e}")
