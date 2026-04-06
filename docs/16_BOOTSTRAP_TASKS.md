# Bootstrap Tasks

## Objective
Create the minimum foundation before feature work starts.

## Day 1
### Project setup
- create repo
- add docs folder
- add apps and packages folders
- add CI placeholder workflows
- add formatting and linting config
- add test runner config

### Decision capture
- create ADR 0001: modular monolith
- create ADR 0002: canonical event contract baseline
- choose first operating domain

## Day 2
### Contracts
- define canonical event schema
- define tracked object schema
- define alert schema
- define source schema
- create schema validation tests

### Fixtures
- create first valid event fixture
- create first invalid event fixture
- create first replay incident fixture

## Day 3
### Database
- create initial migrations
- create canonical event table
- create raw payload table
- create latest state table
- create alert table

### Verification
- run migrations in local CI
- add migration smoke test

## Day 4
### Backend skeleton
- API app scaffold
- worker scaffold
- health endpoint
- event write endpoint for dev testing
- validation path

### Verification
- integration test from API to DB

## Day 5
### First adapter
- choose simple telemetry source
- implement adapter scaffold
- implement normalization
- add adapter fixtures
- add quarantine path

### Verification
- adapter contract tests
- malformed payload tests
- duplicate payload tests

## Day 6
### Frontend shell
- app shell
- map container
- inspector panel
- mock object render
- health strip

### Verification
- frontend smoke tests
- object selection test

## Day 7
### Replay seed
- query endpoint
- simple timeline component
- fixture replay runner

### Verification
- golden replay snapshot for first incident

## End of bootstrap success
Bootstrap is complete when:
- contracts exist
- migrations work
- first adapter works
- event write path works
- one replay fixture passes
- CI runs hard gates
