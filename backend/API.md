# API Documentation

## Base URL

**Development:** `http://localhost:8001`  
**Production:** Configure via environment variables

---

## Endpoints

### Health Check

Check the health status of the backend service.

**Endpoint:** `GET /api/health`

**Response:**
```json
{
  "status": "healthy",
  "message": "Backend is running",
  "timestamp": "2026-01-26T21:15:59.123456Z",
  "version": "1.0.0",
  "environment": "development"
}
```

**Status Codes:**
- `200 OK` - Service is healthy
- `503 Service Unavailable` - Service is unhealthy

---

### Root Information

Get API information and available endpoints.

**Endpoint:** `GET /api/`

**Response:**
```json
{
  "message": "AIO Agency CRM Backend",
  "version": "1.0.0",
  "docs": "/docs",
  "health": "/api/health",
  "timestamp": "2026-01-26T21:15:59.123456Z"
}
```

**Status Codes:**
- `200 OK` - Success

---

## Error Responses

All error responses follow this format:

```json
{
  "error": "Error type",
  "message": "Detailed error message",
  "timestamp": "2026-01-26T21:15:59.123456Z"
}
```

### Common Status Codes

- `200 OK` - Request succeeded
- `400 Bad Request` - Invalid request parameters
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error
- `503 Service Unavailable` - Service temporarily unavailable

---

## Authentication

*Authentication endpoints to be implemented*

---

## Rate Limiting

*Rate limiting to be implemented*

---

## Interactive Documentation

Visit `/docs` for interactive Swagger UI documentation when the server is running.

Example: `http://localhost:8001/docs`
