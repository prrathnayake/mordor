# Validation Instructions

## Running Validation

The full validation suite runs:
1. TypeScript typecheck
2. Biome lint
3. Gate checks (docs, architecture, contracts, adapters)
4. Tests (unit/integration + e2e)

```bash
npm run validate
```

## Individual Checks

### TypeScript
```bash
npm run typecheck
```

### Linting
```bash
npm run lint
```

### Gate Checks
```bash
npm run gate
npm run gate:docs
npm run gate:architecture
npm run gate:contracts
npm run gate:adapters
```

### Tests
```bash
npm run test          # Full test suite
npm run test:vitest   # Unit/integration tests only
npm run test:e2e      # End-to-end tests only
```

## Expected Output

When all validations pass:
- TypeScript: No errors
- Lint: "Checked N files. No fixes applied."
- Gates: All verified
- Tests: All tests pass

## Common Issues

### TypeScript Errors
- Check for missing imports
- Ensure all types are properly exported
- Verify package.json has correct exports

### Lint Errors
- Run `npx biome check --write .` to auto-fix many issues
- Check biome.json configuration

### Test Failures
- Ensure database is running
- Check DATABASE_URL is correct
- Verify PostgreSQL has PostGIS extension enabled
