import sys
import os
import asyncio
from pathlib import Path

# Add backend to path
sys.path.insert(0, r'D:\AIOCRM\backend')

import server

async def test():
    # Bypass require_capability
    server.require_capability = lambda r, c, m: True
    
    try:
        # Mock request is None because we bypassed require_capability
        res = await server.generate_system_docs(None)
        print("SUCCESS:", res)
    except Exception as e:
        import traceback
        print("FAILURE:")
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test())
