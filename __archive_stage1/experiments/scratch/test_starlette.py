
import json
from starlette.responses import Response

def test_starlette_body_setter():
    content = {"message_text": "hello_world"}
    body = json.dumps(content).encode()
    headers = {"content-length": str(len(body))}
    response = Response(content=body, headers=headers)
    
    print(f"Original length: {response.headers['content-length']}")
    
    new_content = {"messageText": "helloWorld"}
    new_body = json.dumps(new_content).encode()
    print(f"New body length: {len(new_body)}")
    
    response.body = new_body
    
    print(f"Header length after update: {response.headers.get('content-length')}")
    if response.headers.get('content-length') != str(len(new_body)):
        print("BUG CONFIRMED: Content-Length was NOT updated!")
    else:
        print("Content-Length was updated.")

if __name__ == "__main__":
    test_starlette_body_setter()
