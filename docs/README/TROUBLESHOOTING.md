# Troubleshooting Guide

Solutions to common issues in MedicalCor Core.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Development Issues](#development-issues)
- [Docker Issues](#docker-issues)
- [Database Issues](#database-issues)
- [Webhook Issues](#webhook-issues)
- [Integration Issues](#integration-issues)
- [Build Issues](#build-issues)
- [Test Issues](#test-issues)
- [Production Issues](#production-issues)

---

## Installation Issues

### Node.js Version Mismatch

**Symptoms**: `error @medicalcor/api: The engine "node" is incompatible`

**Solution**:

```bash
# Check current version
node --version

# Use correct version (20+)
nvm install 20
nvm use 20

# Or install directly
# https://nodejs.org/
```

### pnpm Version Mismatch

**Symptoms**: `error This project requires pnpm version >= 9.0.0`

**Solution**:

```bash
# Update pnpm
npm install -g pnpm@latest

# Verify
pnpm --version
```

### Dependency Installation Failed

**Symptoms**: `pnpm install` hangs or fails with network errors

**Solutions**:

```bash
# Clear pnpm cache
pnpm store prune

# Remove lockfile and node_modules
rm pnpm-lock.yaml
rm -rf node_modules
rm -rf **/node_modules

# Reinstall
pnpm install

# If behind proxy
pnpm config set proxy http://proxy:port
pnpm config set https-proxy http://proxy:port
```

### Permission Errors (Linux/Mac)

**Symptoms**: `EACCES: permission denied`

**Solution**:

```bash
# Fix npm global permissions
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

---

## Development Issues

### Development Server Won't Start

**Symptoms**: `pnpm dev` fails immediately

**Solutions**:

1. **Port already in use**:

   ```bash
   # Find process using port 3000
   lsof -i :3000

   # Kill it
   kill -9 <PID>

   # Or use different port
   PORT=3001 pnpm dev
   ```

2. **Missing environment variables**:

   ```bash
   # Check .env exists
   ls -la .env

   # Copy from example if missing
   cp .env.example .env
   ```

3. **Packages not built**:
   ```bash
   pnpm build
   pnpm dev
   ```

### Hot Reload Not Working

**Symptoms**: Changes don't reflect without restart

**Solutions**:

```bash
# Check file watchers limit (Linux)
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Restart dev server
pnpm dev
```

### TypeScript Errors After Pulling

**Symptoms**: Type errors that weren't there before

**Solutions**:

```bash
# Rebuild all packages
pnpm clean
pnpm install
pnpm build

# Clear TypeScript cache
rm -rf **/tsconfig.tsbuildinfo

# Restart VS Code/IDE
```

---

## Docker Issues

### Containers Won't Start

**Symptoms**: `docker compose up` fails

**Solutions**:

1. **Check Docker is running**:

   ```bash
   docker info
   # If not running, start Docker Desktop or daemon
   ```

2. **Port conflicts**:

   ```bash
   # Check ports
   lsof -i :5432  # PostgreSQL
   lsof -i :6379  # Redis

   # Stop conflicting services
   brew services stop postgresql  # Mac
   sudo systemctl stop postgresql  # Linux
   ```

3. **Clean Docker state**:
   ```bash
   docker compose down -v
   docker system prune -a
   docker compose up -d
   ```

### Container Keeps Restarting

**Symptoms**: Container status shows `Restarting`

**Solution**:

```bash
# Check logs
docker compose logs db
docker compose logs redis

# Common fixes:
# - Ensure volumes have correct permissions
# - Check environment variables are set
# - Verify disk space is available
```

### Volume Permission Issues

**Symptoms**: `permission denied` in container logs

**Solution**:

```bash
# Remove volumes and recreate
docker compose down -v
docker volume prune

# On Linux, fix ownership
sudo chown -R $USER:$USER ./data
```

---

## Database Issues

### Cannot Connect to PostgreSQL

**Symptoms**: `ECONNREFUSED` or `connection refused`

**Solutions**:

1. **Check container is running**:

   ```bash
   docker compose ps
   # Should show medicalcor-db as "running (healthy)"
   ```

2. **Verify connection string**:

   ```bash
   # Check .env
   echo $DATABASE_URL

   # Expected format:
   # postgresql://user:password@localhost:5432/database
   ```

3. **Test connection**:
   ```bash
   docker compose exec db psql -U medicalcor -d medicalcor -c "SELECT 1"
   ```

### Database Migration Failed

**Symptoms**: Error running migrations

**Solutions**:

```bash
# Reset database
docker compose down -v
docker compose up -d

# Wait for database to be ready
sleep 5

# Migrations run automatically via init-db/
```

### "Relation Does Not Exist"

**Symptoms**: `error: relation "table_name" does not exist`

**Solution**:

```bash
# Check tables exist
docker compose exec db psql -U medicalcor -d medicalcor -c "\dt"

# If missing, recreate database
docker compose down -v
docker compose up -d
```

---

## Webhook Issues

### Webhook Not Receiving Events

**Symptoms**: No events reaching your endpoint

**Solutions**:

1. **Verify webhook URL is accessible**:

   ```bash
   # From internet (use ngrok/cloudflare tunnel)
   curl https://your-tunnel.ngrok.io/health
   ```

2. **Check webhook configuration in provider dashboard**:
   - WhatsApp: 360dialog dashboard
   - Stripe: Stripe Dashboard > Webhooks
   - Twilio: Twilio Console > Phone Numbers

3. **Enable local tunnel**:

   ```bash
   # Using ngrok
   ngrok http 3000

   # Using Cloudflare tunnel (built-in)
   docker compose --profile tunnel up -d
   ```

### Signature Verification Failing

**Symptoms**: 401 errors on webhook endpoints

**Solutions**:

1. **Verify secret matches**:

   ```bash
   # Check .env secret matches provider
   echo $WHATSAPP_WEBHOOK_SECRET
   ```

2. **Check raw body is preserved**:

   ```typescript
   // Fastify config
   app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
     req.rawBody = body;
     done(null, JSON.parse(body));
   });
   ```

3. **Check timestamp tolerance**:
   - Default is 5 minutes
   - Ensure server time is synchronized

### WhatsApp Verification Challenge Failing

**Symptoms**: WhatsApp webhook setup fails

**Solution**:

```bash
# Test verification endpoint
curl "http://localhost:3000/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test"

# Should return: test
```

---

## Integration Issues

### HubSpot Rate Limited

**Symptoms**: 429 errors from HubSpot

**Solutions**:

```bash
# Built-in retry handles this automatically
# If persistent, check:

# 1. Reduce concurrent requests
# 2. Batch operations where possible
# 3. Consider HubSpot tier upgrade
```

### OpenAI Timeout

**Symptoms**: Lead scoring timeout

**Solutions**:

```bash
# Rule-based fallback activates automatically
# To increase timeout:
OPENAI_TIMEOUT=30000  # 30 seconds

# Check API status
curl https://status.openai.com/api/v2/status.json
```

### Stripe Webhook Verification Failed

**Symptoms**: Stripe events rejected

**Solutions**:

```bash
# Verify webhook secret
echo $STRIPE_WEBHOOK_SECRET

# Test with Stripe CLI
stripe listen --forward-to localhost:3000/webhooks/stripe

# Use CLI-provided secret for local testing
STRIPE_WEBHOOK_SECRET=whsec_xxx...
```

---

## Build Issues

### Build Fails with Type Errors

**Symptoms**: `pnpm build` shows type errors

**Solutions**:

```bash
# Run typecheck first for clearer errors
pnpm typecheck

# Common fixes:
# 1. Update @types packages
pnpm update @types/node -r

# 2. Clear build cache
pnpm clean
pnpm build
```

### Turborepo Cache Issues

**Symptoms**: Changes not reflected after build

**Solution**:

```bash
# Clear Turborepo cache
rm -rf .turbo
pnpm build --force
```

### Out of Memory During Build

**Symptoms**: `JavaScript heap out of memory`

**Solution**:

```bash
# Increase Node.js memory
export NODE_OPTIONS="--max-old-space-size=4096"
pnpm build
```

---

## Test Issues

### Tests Timing Out

**Symptoms**: Tests fail with timeout errors

**Solutions**:

```bash
# Increase timeout
pnpm test -- --testTimeout=30000

# Or in specific test
it('slow test', async () => {
  // ...
}, 30000);
```

### MSW Mocks Not Working

**Symptoms**: Tests hit real APIs

**Solutions**:

```typescript
// Ensure setup file is configured
// vitest.config.ts
export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
  },
});

// vitest.setup.ts
import { server } from './mocks/server';

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### Tests Pass Locally, Fail in CI

**Symptoms**: Green locally, red in CI

**Solutions**:

```bash
# Match CI environment
rm -rf node_modules
pnpm install --frozen-lockfile
pnpm build
pnpm test

# Check for time-dependent tests
# Use vi.useFakeTimers() for time-sensitive code
```

---

## Production Issues

### High Memory Usage

**Symptoms**: Container OOM killed

**Solutions**:

```yaml
# Increase memory limit (Cloud Run)
resources:
  limits:
    memory: 1Gi
# Or optimize:
# 1. Check for memory leaks
# 2. Reduce concurrent processing
# 3. Implement pagination for large datasets
```

### Slow Response Times

**Symptoms**: API responses > 500ms

**Solutions**:

```bash
# Enable tracing to identify bottleneck
OTEL_ENABLED=true

# Common causes:
# 1. Database queries (add indexes)
# 2. External API calls (add caching)
# 3. Synchronous processing (make async)
```

### Health Check Failing

**Symptoms**: Kubernetes pod not ready

**Solutions**:

```bash
# Check health endpoint
curl http://localhost:3000/health
curl http://localhost:3000/ready

# Common causes:
# 1. Database connection failed
# 2. Redis unavailable
# 3. Startup taking too long

# Increase startup probe timeout if needed
```

---

## Getting Help

### Collect Debug Information

Before asking for help, gather:

```bash
# Environment info
node --version
pnpm --version
docker --version

# Error logs
docker compose logs > docker-logs.txt
pnpm dev 2>&1 | tee dev-logs.txt

# Configuration (without secrets!)
cat .env | grep -v -E "(KEY|TOKEN|SECRET|PASSWORD)"
```

### Support Channels

- **Documentation**: [docs/README/](./README.md)
- **GitHub Issues**: [Report bugs](https://github.com/casagest/medicalcor-core/issues)
- **Discussions**: [Ask questions](https://github.com/casagest/medicalcor-core/discussions)

### Issue Template

```markdown
## Description

Brief description of the issue

## Steps to Reproduce

1. Step one
2. Step two
3. Step three

## Expected Behavior

What should happen

## Actual Behavior

What actually happens

## Environment

- Node.js: x.x.x
- pnpm: x.x.x
- OS: macOS/Linux/Windows
- Docker: x.x.x

## Logs
```

Relevant error messages

```

```
