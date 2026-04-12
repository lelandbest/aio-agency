
import asyncio
import json
from fastapi import Request
from starlette.responses import JSONResponse
from unittest.mock import MagicMock

# Import the middleware from server
import sys
from pathlib import Path
sys.path.append(str(Path(r"D:\AIOCRM\backend")))
from server import enforce_camelcase_response

async def mock_call_next(request: Request):
    # Create a dummy snake_case JSONResponse
    content = {
        "menu_structure": "foo",
        "nested_dict": {"field_policy": True},
        "deep_object": {"tail_payload": "survives_now"}
    }
    return JSONResponse(content)

async def test_camelcase():
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/api/settings/canonical",
        "headers": []
    }
    request = Request(scope)
    
    # Run the middleware
    response = await enforce_camelcase_response(request, mock_call_next)
    
    print(f"Status Code: {response.status_code}")
    print(f"Content-Length in Headers: {response.headers.get('content-length')}")
    body = response.body
    print(f"Body: {body.decode()}")
    print("Test Complete.")

if __name__ == "__main__":
    asyncio.run(test_camelcase())
