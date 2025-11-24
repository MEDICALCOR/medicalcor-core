# API Authentication Guide

**MedicalCor Core - Workflow API Protection**

This guide explains how to use the API key authentication system for workflow endpoints.

---

## 🎯 Overview

The API includes API key authentication to protect sensitive workflow trigger endpoints from unauthorized access. All workflow-related endpoints require a valid API key in the request headers.

**Protected Endpoints:**

- `POST /workflows/lead-score` - Trigger lead scoring workflow
- `POST /workflows/patient-journey` - Trigger patient journey workflow
- `POST /workflows/nurture-sequence` - Trigger nurture sequence workflow
- `POST /workflows/booking-agent` - Trigger booking agent workflow
- `GET /workflows/status/:taskId` - Get workflow execution status

---

## 🔐 Security Features

### 1. Timing-Safe Comparison

All API key comparisons use `crypto.timingSafeEqual()` to prevent timing attacks:

```typescript
crypto.timingSafeEqual(Buffer.from(providedKey), Buffer.from(validKey));
```

### 2. Required in All Environments

Unlike webhooks (which have service-specific verification), API keys are **required in all environments** including development. The server will reject all workflow requests if `API_SECRET_KEY` is not configured.

### 3. Path-Based Protection

The middleware automatically protects all routes starting with `/workflows`. No additional configuration needed per endpoint.

---

## 🚀 Quick Start

### 1. Generate API Secret Key

```bash
openssl rand -base64 32
```

### 2. Configure Environment Variable

Add to `.env`:

```env
# Generate with: openssl rand -base64 32
API_SECRET_KEY=your_generated_secret_key_here
```

### 3. Use in API Requests

Include the API key in the `x-api-key` header:

```bash
curl -X POST https://api.medicalcor.com/workflows/lead-score \
  -H "Content-Type: application/json" \
  -H "x-api-key: your_generated_secret_key_here" \
  -d '{
    "phone": "+40712345678",
    "message": "Interested in rhinoplasty",
    "channel": "whatsapp"
  }'
```

---

## 📖 Usage Examples

### JavaScript/TypeScript

```typescript
const response = await fetch('https://api.medicalcor.com/workflows/lead-score', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': process.env.API_SECRET_KEY,
  },
  body: JSON.stringify({
    phone: '+40712345678',
    message: 'Interested in rhinoplasty',
    channel: 'whatsapp',
  }),
});

if (!response.ok) {
  throw new Error(`API request failed: ${response.statusText}`);
}

const result = await response.json();
console.log('Workflow triggered:', result.taskId);
```

### Python

```python
import os
import requests

response = requests.post(
    'https://api.medicalcor.com/workflows/lead-score',
    headers={
        'Content-Type': 'application/json',
        'x-api-key': os.environ['API_SECRET_KEY'],
    },
    json={
        'phone': '+40712345678',
        'message': 'Interested in rhinoplasty',
        'channel': 'whatsapp',
    }
)

response.raise_for_status()
result = response.json()
print(f"Workflow triggered: {result['taskId']}")
```

### cURL

```bash
# Lead scoring workflow
curl -X POST https://api.medicalcor.com/workflows/lead-score \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_SECRET_KEY" \
  -d '{
    "phone": "+40712345678",
    "hubspotContactId": "12345",
    "message": "Interested in rhinoplasty consultation",
    "channel": "whatsapp"
  }'

# Patient journey workflow
curl -X POST https://api.medicalcor.com/workflows/patient-journey \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_SECRET_KEY" \
  -d '{
    "phone": "+40712345678",
    "hubspotContactId": "12345",
    "channel": "whatsapp",
    "initialScore": 4,
    "classification": "HOT",
    "procedureInterest": ["rhinoplasty", "botox"]
  }'

# Nurture sequence workflow
curl -X POST https://api.medicalcor.com/workflows/nurture-sequence \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_SECRET_KEY" \
  -d '{
    "phone": "+40712345678",
    "hubspotContactId": "12345",
    "sequenceType": "warm_lead"
  }'

# Booking agent workflow
curl -X POST https://api.medicalcor.com/workflows/booking-agent \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_SECRET_KEY" \
  -d '{
    "phone": "+40712345678",
    "hubspotContactId": "12345",
    "procedureType": "rhinoplasty",
    "language": "ro"
  }'

# Check workflow status
curl -X GET https://api.medicalcor.com/workflows/status/task_abc123 \
  -H "x-api-key: $API_SECRET_KEY"
```

---

## 🔒 Security Best Practices

### ✅ DO

- **Generate strong API keys**: Use `openssl rand -base64 32` (minimum 32 bytes)
- **Store securely**: Use environment variables, never hardcode in code
- **Rotate regularly**: Change API keys periodically (e.g., every 90 days)
- **Use HTTPS**: Always use HTTPS in production to prevent key interception
- **Monitor usage**: Log all API requests and monitor for suspicious patterns
- **Use different keys**: Use separate keys for different environments (dev, staging, prod)

### ❌ DON'T

- **Hardcode keys**: Never commit API keys to version control
- **Share keys**: Don't share API keys across different applications
- **Expose in URLs**: Never include API keys in URL query parameters
- **Log keys**: Don't log API keys in application logs
- **Use weak keys**: Avoid short or predictable keys
- **Reuse keys**: Don't reuse the same key across environments

---

## 🧪 Testing

### Test API Authentication

```bash
# Test with valid API key (should return 202)
curl -X POST http://localhost:3000/workflows/lead-score \
  -H "Content-Type: application/json" \
  -H "x-api-key: your_api_key" \
  -d '{"phone": "+40712345678", "message": "test", "channel": "whatsapp"}' \
  -w "\nStatus: %{http_code}\n"

# Test without API key (should return 401)
curl -X POST http://localhost:3000/workflows/lead-score \
  -H "Content-Type: application/json" \
  -d '{"phone": "+40712345678", "message": "test", "channel": "whatsapp"}' \
  -w "\nStatus: %{http_code}\n"

# Test with invalid API key (should return 401)
curl -X POST http://localhost:3000/workflows/lead-score \
  -H "Content-Type: application/json" \
  -H "x-api-key: invalid_key_12345" \
  -d '{"phone": "+40712345678", "message": "test", "channel": "whatsapp"}' \
  -w "\nStatus: %{http_code}\n"
```

### Expected Responses

**✅ Success (202 Accepted):**

```json
{
  "status": "triggered",
  "taskId": "task_abc123xyz",
  "correlationId": "req_12345",
  "message": "Lead scoring workflow has been triggered"
}
```

**❌ Missing API Key (401 Unauthorized):**

```json
{
  "error": "Unauthorized",
  "message": "API key required"
}
```

**❌ Invalid API Key (401 Unauthorized):**

```json
{
  "error": "Unauthorized",
  "message": "Invalid API key"
}
```

**❌ Server Misconfiguration (500 Internal Server Error):**

```json
{
  "error": "Server configuration error"
}
```

---

## 🔧 Troubleshooting

### "API key required" Error

**Cause:** Missing `x-api-key` header in request

**Fix:**

1. Verify header name is exactly `x-api-key` (lowercase, with hyphens)
2. Ensure the header is included in the request
3. Check that the header value is not empty

### "Invalid API key" Error

**Cause:** API key doesn't match configured `API_SECRET_KEY`

**Fix:**

1. Verify `API_SECRET_KEY` is set in `.env` file
2. Restart the API server after changing `.env`
3. Check for extra whitespace in the API key value
4. Ensure you're using the correct environment's key

### "Server configuration error" Error

**Cause:** `API_SECRET_KEY` is not configured on the server

**Fix:**

1. Set `API_SECRET_KEY` in server environment variables
2. Restart the server
3. Verify environment variable is loaded: `echo $API_SECRET_KEY`

### Workflow endpoint returns 404

**Cause:** Route not registered or server not running

**Fix:**

1. Verify server is running: `curl http://localhost:3000/health`
2. Check server logs for startup errors
3. Verify route path is correct (e.g., `/workflows/lead-score`)

---

## 🏗️ Implementation Details

### Plugin Architecture

The API authentication is implemented as a Fastify plugin (`apps/api/src/plugins/api-auth.ts`):

```typescript
// Register plugin in app.ts
await fastify.register(apiAuthPlugin, {
  apiKeys: process.env.API_SECRET_KEY ? [process.env.API_SECRET_KEY] : [],
  protectedPaths: ['/workflows'],
});
```

### Middleware Hook

The plugin adds an `onRequest` hook that:

1. **Checks if path is protected**: Only applies to routes starting with `/workflows`
2. **Validates API key presence**: Returns 401 if header is missing
3. **Verifies API key**: Uses timing-safe comparison to prevent timing attacks
4. **Logs authentication events**: Logs warnings for failed attempts

### Configuration Options

| Option           | Type       | Default          | Description             |
| ---------------- | ---------- | ---------------- | ----------------------- |
| `apiKeys`        | `string[]` | `[]`             | List of valid API keys  |
| `headerName`     | `string`   | `'x-api-key'`    | Header name for API key |
| `protectedPaths` | `string[]` | `['/workflows']` | Paths to protect        |

---

## 🔄 Key Rotation

To rotate your API key safely:

1. **Generate new key:**

   ```bash
   openssl rand -base64 32
   ```

2. **Add new key to environment** (temporarily support both):

   ```typescript
   // In app.ts
   const apiKeys = [
     process.env.API_SECRET_KEY, // Old key
     process.env.API_SECRET_KEY_NEW, // New key
   ].filter(Boolean);
   ```

3. **Update all clients** to use new key

4. **Remove old key** from environment after grace period

5. **Simplify configuration** back to single key

---

## 📊 Monitoring

### Log Examples

**Successful authentication:**

```
INFO: POST /workflows/lead-score (200ms) - workflow triggered
```

**Failed authentication (missing key):**

```
WARN: Missing API key for /workflows/lead-score
```

**Failed authentication (invalid key):**

```
WARN: Invalid API key for /workflows/lead-score
```

**Server misconfiguration:**

```
ERROR: CRITICAL - API_SECRET_KEY not configured
```

### Recommended Monitoring

- **Alert on repeated 401 errors**: Potential brute-force attack
- **Alert on 500 errors**: Server misconfiguration
- **Track API key usage**: Monitor which keys are being used
- **Log IP addresses**: Track request origins for security analysis

---

## 🆘 Support

For issues or questions:

1. Check this documentation
2. Review `apps/api/src/plugins/api-auth.ts` implementation
3. Check server logs for authentication errors
4. Open an issue on GitHub

---

**Last Updated:** November 24, 2025
**Version:** 1.0.0
**Status:** ✅ Production Ready
