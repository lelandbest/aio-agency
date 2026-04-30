import urllib.request
import urllib.error
import json

url = "https://go.aioflow.com/api/input/1ublf0/contact?public_key=HH27IrpCd4OWCs643NsL"
data = {
    "firstName": "Test",
    "lastName": "User",
    "email": "test@aioflow.test",
    "phone": "+12345678901",
    "companyName": "Test Agency",
    "plan": "control"
}

req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'))
req.add_header('Content-Type', 'application/json')

try:
    with urllib.request.urlopen(req) as response:
        print(f"Status Code: {response.getcode()}")
        print(f"Response: {response.read().decode('utf-8')}")
except urllib.error.HTTPError as e:
    print(f"HTTP Error: {e.code} - {e.read().decode('utf-8')}")
except Exception as e:
    print(f"Error: {e}")
