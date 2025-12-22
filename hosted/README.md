# Hosted Services

This directory contains code for hosted/paid features that are not part of the open-source distribution.

## Directory Structure

- `services/` - Multi-tenant service implementations
- `ui/` - Admin and user dashboards
- `jobs/` - Background job queue workers
- `billing/` - Billing and payment integration

## License

Code in this directory is proprietary and not included in the MIT-licensed open-source release.

## Development

Hosted services integrate with the open-source core by:
1. Using the same database schema and migrations
2. Extending the core API with additional endpoints
3. Implementing multi-tenant orchestration on top of tenant-scoped core services
4. Adding job queue infrastructure for distributed processing

See `../docs/OSS_BOUNDARY.md` for details on the boundary between OSS and hosted code.

