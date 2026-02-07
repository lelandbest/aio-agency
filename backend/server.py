from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
import os
import logging
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="AIO Agency CRM Backend",
    description="Backend API for AIO Agency CRM platform",
    version="1.0.0"
)

# CORS Configuration - Use specific origins for security
# In production, set ALLOWED_ORIGINS to your frontend domain
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["Content-Type", "Authorization"],
)

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "message": str(exc) if os.getenv("DEBUG") == "true" else "An unexpected error occurred",
            "timestamp": datetime.utcnow().isoformat()
        }
    )

@app.get("/api/health")
async def health():
    """
    Health check endpoint
    Returns system status and timestamp
    """
    try:
        # Add actual health checks here (database, external services, etc.)
        health_status = {
            "status": "healthy",
            "message": "Backend is running",
            "timestamp": datetime.utcnow().isoformat(),
            "version": "1.0.0",
            "environment": os.getenv("ENVIRONMENT", "development")
        }
        
        logger.info("Health check successful")
        return health_status
        
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(
            status_code=503,
            detail={
                "status": "unhealthy",
                "message": "Service unavailable",
                "timestamp": datetime.utcnow().isoformat()
            }
        )

@app.get("/api/")
async def root():
    """
    Root endpoint
    Returns API information
    """
    try:
        return {
            "message": "AIO Agency CRM Backend",
            "version": "1.0.0",
            "docs": "/docs",
            "health": "/api/health",
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Root endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

# Startup event
@app.on_event("startup")
async def startup_event():
    logger.info("🚀 AIO Agency Backend starting up...")
    logger.info(f"Environment: {os.getenv('ENVIRONMENT', 'development')}")
    logger.info(f"Allowed origins: {ALLOWED_ORIGINS}")

# Shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    logger.info("🛑 AIO Agency Backend shutting down...")

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8001))
    host = os.getenv("HOST", "0.0.0.0")
    
    logger.info(f"Starting server on {host}:{port}")
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info"
    )
