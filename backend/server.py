from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health():
    return {"status": "ok", "message": "Backend is running"}

@app.get("/api/")
async def root():
    return {"message": "AIO Agency CRM Backend"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
