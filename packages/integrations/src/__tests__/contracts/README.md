# Contract Tests

Consumer-driven contract tests for external service integrations using [Pact](https://docs.pact.io/).

## Overview

Contract tests verify that our integration clients (consumers) expect API responses in the format that external services (providers) actually return. This catches integration issues early, before they reach production.

## Test Files

- `pact-setup.ts` - Shared Pact configuration and matchers
- `hubspot.contract.test.ts` - HubSpot CRM API contract tests
- `stripe.contract.test.ts` - Stripe Payment API contract tests

## Running Contract Tests

```bash
# Run contract tests only
pnpm test:contract

# Run contract tests in watch mode
pnpm test:contract:watch
```

## Generated Pacts

Contract tests generate Pact files in `packages/integrations/pacts/`:

- `medicalcor-integrations-hubspot-api.json`
- `medicalcor-integrations-stripe-api.json`

These JSON files document the expected API interactions and can be:

1. Used for provider verification against the actual APIs
2. Published to a Pact Broker for contract management
3. Used in CI/CD pipelines to verify API compatibility

## Test Structure

Each contract test follows this pattern:

```typescript
await pact
  .addInteraction()
  .given('provider state') // Pre-condition
  .uponReceiving('interaction name') // Description
  .withRequest('METHOD', '/path', (builder) => {
    // Define expected request format
  })
  .willRespondWith(200, (builder) => {
    // Define expected response format using matchers
  })
  .executeTest(async (mockServer) => {
    // Make actual HTTP request to mock server
    // Assert response matches expectations
  });
```

## Matchers

Use Pact matchers for flexible matching:

- `like()` - Match by type/structure
- `eachLike()` - Match arrays
- `string()` - Match strings
- `integer()` - Match integers
- `boolean()` - Match booleans
- `iso8601DateTime()` - Match ISO timestamps
- `regex()` - Match with regex pattern

## Adding New Contract Tests

1. Identify the external API endpoint to test
2. Document the request format we send
3. Document the response format we expect
4. Add test using the Pact interaction builder
5. Run tests to generate updated contract files

## Difference from Unit Tests

| Aspect      | Unit Tests          | Contract Tests        |
| ----------- | ------------------- | --------------------- |
| Purpose     | Test internal logic | Test API expectations |
| Mock Server | MSW handlers        | Pact mock server      |
| Output      | Pass/fail           | Contract JSON files   |
| Scope       | Function/class      | API interaction       |
| Provider    | Mocked              | Can be verified       |
