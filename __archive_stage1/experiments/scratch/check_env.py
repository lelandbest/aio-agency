
import os
from dotenv import load_dotenv

load_dotenv()
print(f"TTS_PROVIDER: {os.environ.get('TTS_PROVIDER')}")
print(f"ASYNC_API_KEY: {'SET' if os.environ.get('ASYNC_API_KEY') else 'NOT SET'}")
print(f"ELEVENLABS_API_KEY: {'SET' if os.environ.get('ELEVENLABS_API_KEY') else 'NOT SET'}")
