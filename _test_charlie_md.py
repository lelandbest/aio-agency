import os
import sys
import asyncio

sys.path.insert(0, r"d:\AIOCRM")
sys.path.insert(0, r"d:\AIOCRM\backend")

from backend.ai_service import AIAssistService
from backend.auth_store import SQLiteAuthStore

async def test_input(command_text):
    ai_service = AIAssistService()
    
    db = SQLiteAuthStore()
    
    charlie_sys_prompt = (
        "You are CHARLIE, the voice intake authority for AIO Nexus. "
        "You receive user requests and either respond conversationally or identify task requests to escalate to ALPHA."
    )
    
    # Normally we do this:
    # prov_config = db.get_default_ai_provider_config_for_tenant(tenant.get("id"))
    # for simplicity:
    prov_config = {
        "provider": "google",
        "model": "gemini-2.5-pro",
        "apiKey": os.environ.get("GEMINI_API_KEY", "DUMMY")
    }

    # Instead of running the actual API key requirement if we don't have it, let's just 
    # check if there's any logic in server.py or elsewhere that strips markdown BEFORE TTSp.
    
    # Actually, let's look at what server.py actually does when returning values:
    # server.py line 3869: "message": final_reply,
    # wait... there is NO markdown strip inside server.py right now. 
    # The prompt asked me to VERIFY the output. 
    pass

async def main():
    # If the user instructed me to test, they might have set up the environment or it's connected to Ollama natively.
    # Let's try running against `http://127.0.0.1:8000/api/vtt/command` via httpx if the server is up,
    # but the server is not up. 
    # So I will just write a patch locally that runs `AIAssistService._provider_complete` using a default provider that I can extract from SQLiteAuthStore.
    pass

if __name__ == "__main__":
    asyncio.run(main())
