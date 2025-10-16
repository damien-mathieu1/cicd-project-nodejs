# Infrastructure Overview: Kubernetes + ArgoCD

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Environments](#environments)
3. [Database Architecture](#database-architecture)
4. [Deployment Flow](#deployment-flow)
5. [Automatic Cleanup](#automatic-cleanup)
6. [Monitoring & Troubleshooting](#monitoring--troubleshooting)

---

## Architecture Overview

This project uses a **GitOps** approach with **ArgoCD** managing deployments to a local **Kubernetes** cluster (kind/minikube).

```
┌─────────────────────────────────────────────────────────────┐
│                        GitHub Repository                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Code Changes │  │ Docker Image │  │  Helm Chart  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└────────────┬────────────────┬────────────────┬──────────────┘
             │                │                │
             │                │                │
             ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────┐
│                    GitHub Actions (CI/CD)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │     Tests    │  │ Build Image  │  │ Push to Hub  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              Kubernetes Cluster (Local)                      │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   ArgoCD (argocd ns)                  │   │
│  │  ┌────────────────┐    ┌────────────────┐           │   │
│  │  │  Application   │    │ ApplicationSet │           │   │
│  │  │  (Production)  │    │   (Preprods)   │           │   │
│  │  └────────────────┘    └────────────────┘           │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │         Production Environment (default ns)         │    │
│  │  ┌──────────┐  ┌────────────┐  ┌────────────────┐  │    │
│  │  │   App    │  │ PostgreSQL │  │ Cleanup CronJob │  │    │
│  │  │  Pods    │  │  (Shared)  │  │  (every 5min)   │  │    │
│  │  └──────────┘  └────────────┘  └────────────────┘  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │      Preprod Environments (preprod-pr-* ns)         │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐          │    │
│  │  │ PR-4 App │  │ PR-5 App │  │ PR-N App │          │    │
│  │  └──────────┘  └──────────┘  └──────────┘          │    │
│  │  (Each uses shared PostgreSQL in default ns)       │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## Environments

### Production Environment
- **Namespace**: `default`
- **Deployment**: Manual ArgoCD Application
- **Database**: Dedicated PostgreSQL instance (`cicd-project-nodejs-postgresql`)
- **Database name**: `app`
- **Image tag**: `unstable` (built from `main` branch)
- **URL**: `http://localhost:3333` (via port-forward)

### Preprod Environments (PR-based)
- **Namespace**: `preprod-pr-{NUMBER}` (e.g., `preprod-pr-4`)
- **Deployment**: Automatic via ArgoCD ApplicationSet
- **Database**: Shared PostgreSQL (uses production PostgreSQL instance)
- **Database name**: `app_preprod_pr_{NUMBER}` (e.g., `app_preprod_pr_4`)
- **Image tag**: `pr-{NUMBER}` (e.g., `pr-4`)
- **URL**: `http://localhost:3000{NUMBER}` (NodePort: `30000 + PR number`)

**Key Features:**
- Automatically created when you add the `deploy-preprod` label to a PR
- Automatically cleaned up when you remove the label (within 5 minutes)
- Isolated namespace per PR
- Isolated database per PR (cloned from production)
- No persistent volumes (ephemeral)

---

## Database Architecture

### Shared PostgreSQL Approach

Instead of deploying one PostgreSQL instance per preprod (resource-intensive), we use a **shared PostgreSQL** approach:

```
┌──────────────────────────────────────────────────────┐
│      PostgreSQL (default namespace)                  │
│                                                       │
│  ┌────────────────────────────────────────────────┐ │
│  │ Database: app (Production)                     │ │
│  └────────────────────────────────────────────────┘ │
│                                                       │
│  ┌────────────────────────────────────────────────┐ │
│  │ Database: app_preprod_pr_4 (Preprod PR-4)     │ │
│  └────────────────────────────────────────────────┘ │
│                                                       │
│  ┌────────────────────────────────────────────────┐ │
│  │ Database: app_preprod_pr_5 (Preprod PR-5)     │ │
│  └────────────────────────────────────────────────┘ │
│                                                       │
│  └── (More preprod databases as needed)             │
└──────────────────────────────────────────────────────┘
```

**How it works:**

1. **Production** connects to `cicd-project-nodejs-postgresql.default.svc.cluster.local` → Database `app`
2. **Preprod PR-4** connects to `cicd-project-nodejs-postgresql.default.svc.cluster.local` → Database `app_preprod_pr_4`
3. **Preprod PR-5** connects to `cicd-project-nodejs-postgresql.default.svc.cluster.local` → Database `app_preprod_pr_5`

**Database Creation Flow:**

When a preprod is deployed:
1. An **init container** runs before the app starts
2. It checks if the database `app_preprod_pr_{NUMBER}` exists
3. If not, it creates the database and clones both schema and data from production:
   ```bash
   pg_dump -U root -h postgres-host -d app --schema-only | psql -d app_preprod_pr_4
   pg_dump -U root -h postgres-host -d app --data-only | psql -d app_preprod_pr_4
   ```

**Benefits:**
- ✅ Resource efficient (1 PostgreSQL for all environments)
- ✅ Fast preprod creation (database clone is quick)
- ✅ Realistic testing (uses production data)
- ✅ Easy cleanup (just drop the database)

---

## Deployment Flow

### Production Deployment (Main Branch)

```
1. Developer pushes to main branch
   ↓
2. GitHub Actions runs:
   - Run tests
   - Build Docker image
   - Tag as "unstable"
   - Push to Docker Hub
   ↓
3. ArgoCD syncs automatically:
   - Pulls latest Helm chart from main
   - Applies to default namespace
   - Runs migration job
   - Deploys new pods
```

**Files involved:**
- `.github/workflows/ci-all.yml` - Test + Build + Push
- `.argocd/production-application.yaml` - ArgoCD Application definition

### Preprod Deployment (Pull Request)

```
1. Developer creates a PR
   ↓
2. GitHub Actions runs (pr-docker-image.yml):
   - Build Docker image
   - Tag as "pr-{NUMBER}"
   - Push to Docker Hub
   - Comment on PR with image details
   ↓
3. Developer adds "deploy-preprod" label
   ↓
4. ArgoCD ApplicationSet detects label:
   - Creates Application "cicd-project-pr-{NUMBER}"
   - Creates namespace "preprod-pr-{NUMBER}"
   ↓
5. Deployment starts:
   - Init container creates & clones database
   - Migration job runs
   - App pods start
   - Service exposes on NodePort (30000 + PR number)
```

**Files involved:**
- `.github/workflows/pr-docker-image.yml` - Build PR image
- `.argocd/preprod-applicationset.yaml` - ApplicationSet definition
- `cicd-app-chart/values-preprod.yaml` - Preprod Helm values
- `cicd-app-chart/templates/deployment.yaml` - Init container for DB setup

---

## Automatic Cleanup

### Problem with ArgoCD Hooks
ArgoCD PreDelete hooks **do not work** with ApplicationSets when you remove a label. The Application is deleted immediately, and hooks never execute.

### Solution: Cleanup CronJob

A **CronJob** runs every 5 minutes and cleans up orphaned preprod environments:

```
┌─────────────────────────────────────────────────────┐
│  Cleanup CronJob (runs every 5 minutes)            │
│                                                      │
│  1. List all namespaces matching "preprod-pr-*"    │
│  2. List all ArgoCD Applications                    │
│  3. For each namespace:                             │
│     - Check if corresponding Application exists     │
│     - If NOT exists (orphaned):                     │
│       → Drop database "app_preprod_pr_{NUMBER}"     │
│       → Delete namespace "preprod-pr-{NUMBER}"      │
└─────────────────────────────────────────────────────┘
```

**Files involved:**
- `.argocd/preprod-cleanup-cronjob.yaml`

**Manual cleanup trigger:**
```bash
kubectl create job --from=cronjob/preprod-cleanup -n default manual-cleanup-$(date +%s)
```

**How to verify cleanup:**
```bash
# Check if orphaned namespaces exist
kubectl get namespaces | grep preprod

# Check if orphaned databases exist
kubectl exec -n default cicd-project-nodejs-postgresql-0 -- \
  sh -c 'PGPASSWORD=root psql -U root -d postgres -c "\l"' | grep preprod
```

---

## Monitoring & Troubleshooting

### Check ArgoCD Applications
```bash
# List all applications
kubectl get applications -n argocd

# Check specific application status
kubectl describe application cicd-project-pr-4 -n argocd

# Force sync
kubectl patch application cicd-project-pr-4 -n argocd \
  --type merge -p '{"operation":{"initiatedBy":{"username":"admin"},"sync":{"revision":"HEAD"}}}'
```

### Check Preprod Status
```bash
# List all preprod namespaces
kubectl get namespaces | grep preprod

# Check pods in a preprod
kubectl get pods -n preprod-pr-4

# Check logs
kubectl logs -n preprod-pr-4 -l app.kubernetes.io/name=cicd-app-chart

# Check migration job
kubectl get jobs -n preprod-pr-4
kubectl logs -n preprod-pr-4 job/cicd-project-pr-4-migration
```

### Check Database Status
```bash
# List all databases
kubectl exec -n default cicd-project-nodejs-postgresql-0 -- \
  sh -c 'PGPASSWORD=root psql -U root -d postgres -c "\l"'

# Check preprod databases
kubectl exec -n default cicd-project-nodejs-postgresql-0 -- \
  sh -c 'PGPASSWORD=root psql -U root -d postgres -c "\l"' | grep preprod

# Connect to a preprod database
kubectl exec -it -n default cicd-project-nodejs-postgresql-0 -- \
  sh -c 'PGPASSWORD=root psql -U root -d app_preprod_pr_4'
```

### Access ArgoCD UI
```bash
# Port-forward ArgoCD server
kubectl port-forward svc/argocd-server -n argocd 8080:80

# Get admin password
kubectl get secret argocd-initial-admin-secret -n argocd \
  -o jsonpath="{.data.password}" | base64 -d

# Access UI
# http://localhost:8080
# Username: admin
# Password: (from command above)
```

### Access Production App
```bash
# Port-forward production app
kubectl port-forward svc/cicd-project-nodejs-cicd-app-chart -n default 3333:80

# Access app
# http://localhost:3333
```

### Access Preprod App
```bash
# Using NodePort (direct access)
# PR-4: http://localhost:30004
# PR-5: http://localhost:30005

# Or using port-forward
kubectl port-forward svc/cicd-project-pr-4 -n preprod-pr-4 3334:80
# http://localhost:3334
```

### Common Issues

#### 1. Migration Job Fails with "ENOTFOUND"
**Problem**: Migration job can't connect to PostgreSQL
**Solution**: Check that `migration-job.yaml` uses correct DB host (shared PostgreSQL for preprods)

#### 2. Preprod Namespace Not Cleaned Up
**Problem**: Namespace remains after removing label
**Solution**: Wait 5 minutes for CronJob, or trigger manually:
```bash
kubectl create job --from=cronjob/preprod-cleanup -n default manual-cleanup-$(date +%s)
```

#### 3. Image Pull Error
**Problem**: Pod can't pull Docker image
**Solution**: Check image tag matches. For PR-4, tag should be `pr-4` not a SHA:
```bash
kubectl describe pod -n preprod-pr-4 <pod-name>
```

#### 4. ArgoCD Application "OutOfSync"
**Problem**: Changes in Git not reflected in cluster
**Solution**: ArgoCD auto-sync should handle it. If not, force sync:
```bash
kubectl patch application <app-name> -n argocd --type merge \
  -p '{"operation":{"initiatedBy":{"username":"admin"},"sync":{"revision":"HEAD"}}}'
```

---

## Architecture Decisions

### Why GitOps with ArgoCD?
- ✅ **Declarative**: Infrastructure and applications defined in Git
- ✅ **Automated**: Changes in Git automatically applied to cluster
- ✅ **Auditable**: Full history of all changes in Git
- ✅ **Rollback**: Easy to revert to previous versions

### Why Shared PostgreSQL?
- ✅ **Resource efficient**: One PostgreSQL instead of N instances
- ✅ **Fast setup**: Creating a database is faster than deploying PostgreSQL
- ✅ **Easy cleanup**: Drop database instead of uninstalling Helm chart
- ✅ **Realistic testing**: Preprods use cloned production data

### Why CronJob for Cleanup (not Hooks)?
- ✅ **Reliable**: Runs independently of ArgoCD lifecycle
- ✅ **Simple**: Easy to understand and debug
- ✅ **Flexible**: Can handle edge cases (manual deletions, etc.)
- ❌ PreDelete hooks don't work with ApplicationSets on label removal

### Why PR Number as Image Tag?
- ✅ **Predictable**: Always matches between GitHub Actions and ArgoCD
- ✅ **Readable**: `pr-4` is clearer than `0cbf43f8`
- ✅ **No sync issues**: No mismatch between short/long SHA

---

## Summary

| Component | Purpose | Location |
|-----------|---------|----------|
| **ArgoCD** | GitOps deployment | `argocd` namespace |
| **Production** | Main application | `default` namespace |
| **Preprods** | PR-based testing environments | `preprod-pr-*` namespaces |
| **PostgreSQL** | Shared database | `default` namespace |
| **Cleanup CronJob** | Automatic cleanup of orphaned preprods | `default` namespace |
| **GitHub Actions** | CI/CD pipeline | `.github/workflows/` |
| **Helm Charts** | Kubernetes manifests | `cicd-app-chart/` |

**Key Workflows:**
1. Push to `main` → Production deployment
2. Create PR + add label → Preprod deployment
3. Remove label → Automatic cleanup (within 5 minutes)
