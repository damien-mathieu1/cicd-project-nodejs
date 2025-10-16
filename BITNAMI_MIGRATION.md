# Bitnami Migration Guide

## Background

In 2025, Bitnami (now owned by Broadcom) has changed their distribution model:

- **August 28, 2025**: Bitnami stopped publishing new images to `https://charts.bitnami.com/bitnami`
- **September 29, 2025**: Old public catalog will be deleted
- Most images moved behind a paid subscription ($50k-72k/year)

## What Changed in This Project

### PostgreSQL Chart Migration

**Before:**
```yaml
dependencies:
  - name: postgresql
    version: 16.5.0
    repository: https://charts.bitnami.com/bitnami
```

**After:**
```yaml
dependencies:
  - name: postgresql
    version: 18.0.15
    repository: oci://registry-1.docker.io/bitnamicharts
```

### Changes:
- ✅ Migrated from HTTP repository to **OCI registry** format
- ✅ Updated PostgreSQL from **16.5.0** → **18.0.15** (latest free version)
- ✅ Using `bitnamicharts` DockerHub organization (free tier)

## Alternative Solutions

If you encounter issues with Bitnami in the future, consider these alternatives:

### 1. Official PostgreSQL Docker Images

Replace the Bitnami PostgreSQL chart with:
```yaml
# Use official PostgreSQL image
image:
  repository: postgres
  tag: "17-alpine"
```

### 2. CloudNativePG Operator

For production workloads, use a PostgreSQL operator:
```bash
kubectl apply -f https://raw.githubusercontent.com/cloudnative-pg/cloudnative-pg/release-1.24/releases/cnpg-1.24.0.yaml
```

### 3. Zalando PostgreSQL Operator

Another robust alternative:
```bash
helm repo add postgres-operator-charts https://opensource.zalando.com/postgres-operator/charts/postgres-operator
helm install postgres-operator postgres-operator-charts/postgres-operator
```

## Impact on Existing Deployments

### No Breaking Changes

The migration to OCI format is **backward compatible**:
- Same chart structure
- Same values.yaml configuration
- PostgreSQL upgraded from v16 → v18 (minor version bump)

### Testing

To verify the chart works correctly:

```bash
# Update dependencies
cd cicd-app-chart
helm dependency update

# Test rendering
helm template test . --dry-run

# Install/upgrade
helm upgrade --install cicd-project . -n default
```

## Timeline for Future Actions

- **Today**: Charts migrated to OCI format ✅
- **September 29, 2025**: Old Bitnami catalog deleted
- **Future**: Monitor `bitnamicharts` for potential restrictions

## Resources

- [Bitnami OCI Migration Announcement](https://github.com/bitnami/charts/issues/35164)
- [Docker Official Images](https://hub.docker.com/_/postgres)
- [CloudNativePG Documentation](https://cloudnative-pg.io/)
- [Bitnami Charts on Docker Hub](https://hub.docker.com/u/bitnamicharts)

## Notes

The **free tier** of `bitnamicharts` only provides `:latest` tags. Versioned tags (e.g., `18.0.15`) are currently available but may require a subscription in the future. Monitor for deprecation warnings.
