# Security, Privacy, and Safety

## Goal
Protect data sources, user access, operational integrity, and the trustworthiness of the timeline.

## Security principles
- least privilege
- strong source credential isolation
- full auditability
- explicit provenance
- secure defaults
- no hidden data mutation

## Identity and access
Define roles:
- `viewer`
- `operator`
- `analyst`
- `admin`
- `developer_admin`

Each role must have explicit permissions.

Examples:
- viewer: read selected layers
- operator: acknowledge alerts
- analyst: replay and export incidents
- admin: manage sources and policies
- developer_admin: limited engineering controls

## Source credential handling
- never store secrets in code
- use secure secret storage
- rotate credentials
- separate dev/test/prod credentials
- log secret usage only as metadata, never as secret value

## Data classification
Classify all source data:
- public
- internal
- restricted
- highly sensitive

Policies must depend on classification.

## Privacy boundaries
If using cameras, person-like observations, or location history:
- define lawful basis and organizational policy
- minimize stored personally identifiable details
- separate identity resolution from movement events if possible
- support retention rules

## Audit requirements
Audit log must cover:
- user actions
- source changes
- rule changes
- export actions
- login or access changes
- replay access for sensitive windows
- admin overrides

## Safety rules for analytics
- no autonomous actuation in MVP
- alerts are advisory unless explicitly integrated into a controlled downstream system
- AI summaries must be labeled as summaries
- rule changes must be versioned and reviewed

## Network and service security
- TLS everywhere in deployed environments
- authenticated admin endpoints
- rate limiting for public-facing APIs
- signed or protected service-to-service credentials
- segmentation between ingest and public access surfaces when possible

## Data integrity
- append-only canonical events
- migration checksums
- backup and restore plan
- state rebuild procedure
- corruption detection jobs

## Retention
Define retention for:
- raw payloads
- canonical events
- audit logs
- exports
- attachments

Retention policy must be explicit and environment-specific.

## Security test requirements
- auth tests
- permission boundary tests
- secret leakage checks
- audit logging tests
- export access tests
- injection / malformed input tests

## Non-negotiables
1. No secrets in source control.
2. No admin mutation without audit trace.
3. No analytics output without provenance and rule version.
4. No sensitive export without authorization check.
