## Summary

<!-- Provide a brief description of your changes -->

## Type of Change

<!-- Check all that apply -->

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Refactoring (code change that neither fixes a bug nor adds a feature)
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Test improvement

## Related Issues

<!-- Link any related issues here using "Fixes #123" or "Closes #123" -->

## Code Review Checklist

### Code Quality

- [ ] Code follows the existing style and patterns in the codebase
- [ ] TypeScript strict mode compliance verified (`pnpm typecheck` passes)
- [ ] No `any` types introduced (use `unknown` or proper types)
- [ ] Result type pattern used for error handling where appropriate
- [ ] No console.log statements (use proper logging/telemetry)

### Testing

- [ ] Tests pass locally (`pnpm test`)
- [ ] New functionality has corresponding tests
- [ ] Test coverage maintained or improved
- [ ] E2E tests pass if applicable

### Security

- [ ] No hardcoded secrets or credentials
- [ ] Input validation implemented for user data
- [ ] PII fields use proper redaction/handling
- [ ] GDPR consent requirements considered

### Architecture

- [ ] Changes follow CQRS patterns where applicable
- [ ] Domain events emitted for significant state changes
- [ ] Package boundaries respected (no circular dependencies)
- [ ] Branded types used for domain identifiers

### Documentation

- [ ] Public APIs have JSDoc comments
- [ ] Breaking changes documented
- [ ] README updated if needed

## Test Plan

<!-- Describe how to test these changes -->

1.

## Screenshots

<!-- If applicable, add screenshots to help explain your changes -->

## Additional Notes

<!-- Any additional information reviewers should know -->
