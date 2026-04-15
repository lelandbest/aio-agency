import requests
import json

BASE_URL = "http://localhost:8001"
headers = {
    "Origin": "http://localhost:5175",
    "Content-Type": "application/json"
}

def check_endpoint(method, path, data=None):
    print(f"\n--- Testing {method} {path} ---")
    try:
        url = f"{BASE_URL}{path}"
        response = requests.request(method, url, headers=headers, json=data)
        print(f"Status: {response.status_code}")
        print("Response Headers:")
        for k, v in response.headers.items():
            print(f"  {k}: {v}")
        
        content_type = response.headers.get("Content-Type", "")
        if "application/json" in content_type:
            try:
                body = response.json()
                print("JSON Valid: YES")
                # Print sample only if not too huge
                # print(f"Body: {json.dumps(body, indent=2)}")
            except Exception as e:
                print(f"JSON Parse Error: {e}")
        else:
            print(f"Content-Type: {content_type}")
            print(f"Body Length: {len(response.content)}")
    except Exception as e:
        print(f"Request Error: {e}")

if __name__ == "__main__":
    # Task 1 & 2: CORS and Shape
    check_endpoint("GET", "/api/health")
    
    # Task 3: Error Handling
    check_endpoint("POST", "/api/health") 
    
    # Task 4: Media/Stream Safety (FileResponse)
    filename = "0bb0e7d584ba464688380397ea27a59a.wav"
    check_endpoint("GET", f"/api/media/audio/{filename}")
