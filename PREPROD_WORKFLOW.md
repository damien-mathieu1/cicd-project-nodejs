# Preprod Deployment Workflow

This document describes how to deploy and test preprod environments for Pull Requests.

## Overview

This project uses **GitOps with ArgoCD** to manage deployments:
- **Production**: Auto-deployed from `main` branch to `default` namespace
- **Preprod**: Manually deployed from PR branches to isolated `preprod-pr-{number}` namespaces

## Quick Start: Deploy a Preprod

### 1. Create a Pull Request

```bash
git checkout -b feat/awesome-feature
# Make your changes
git push origin feat/awesome-feature
# Create PR on GitHub
```

### 2. Deploy Preprod

When your feature is ready to test, comment on your PR:

```
/deploy-preprod
```

The GitHub Action will:
1. Create an ArgoCD Application: `cicd-project-pr-{number}`
2. Create an isolated namespace: `preprod-pr-{number}`
3. Comment back with access instructions

### 3. Sync the Application

The application is created but **not automatically synced**. You need to manually sync it:

**Option A: ArgoCD UI** (Recommended)
1. Open ArgoCD: http://localhost:8080
2. Find your application: `cicd-project-pr-{number}`
3. Click **Sync** → **Synchronize**

**Option B: CLI**
```bash
kubectl patch application cicd-project-pr-{NUMBER} -n argocd \
  --type merge \
  -p '{"metadata": {"annotations": {"argocd.argoproj.io/refresh": "hard"}}}'
```

### 4. Access Your Preprod

Once synced, access your preprod:

```bash
# Port-forward (easiest)
kubectl port-forward -n preprod-pr-{NUMBER} \
  svc/cicd-project-pr-{NUMBER}-cicd-app-chart 8{NUMBER}:80

# Then open: http://localhost:8{NUMBER}
```

Example for PR #123:
```bash
kubectl port-forward -n preprod-pr-123 \
  svc/cicd-project-pr-123-cicd-app-chart 8123:80

# Open: http://localhost:8123
```

### 5. Cleanup

When you close or merge the PR, the preprod is **automatically deleted**.

## Architecture

### Production Environment
- **Application**: `cicd-project-nodejs`
- **Namespace**: `default`
- **Branch**: `main`
- **Sync**: Automatic (every push to main)
- **Values**: `values.yaml` (full resources)
- **Access**: `http://localhost:3333` (via port-forward)

### Preprod Environments
- **Application**: `cicd-project-pr-{NUMBER}`
- **Namespace**: `preprod-pr-{NUMBER}`
- **Branch**: Feature branch (e.g., `feat/awesome`)
- **Sync**: Manual (trigger via ArgoCD UI)
- **Values**: `values-preprod.yaml` (reduced resources)
- **Access**: `http://localhost:8{NUMBER}` or NodePort `30000 + {NUMBER}`

## Resource Isolation

Each preprod has:
- ✅ Isolated namespace
- ✅ Isolated PostgreSQL database
- ✅ Reduced resources (CPU/Memory)
- ✅ Separate NodePort (30000 + PR number)
- ✅ Independent from production

## Configuration Files

```
.argocd/
├── production-application.yaml       # Prod ArgoCD Application
├── preprod-application-template.yaml # Template for preprods
└── README.md

.github/workflows/
├── deploy-preprod.yml     # Deploy preprod on /deploy-preprod comment
└── cleanup-preprod.yml    # Cleanup preprod when PR closes

cicd-app-chart/
├── values.yaml            # Production configuration
└── values-preprod.yaml    # Preprod configuration (lighter)
```

## GitHub Workflows

### Deploy Preprod (`deploy-preprod.yml`)

**Trigger**: Comment `/deploy-preprod` on a PR

**What it does:**
1. Gets PR details (number, branch, commit SHA)
2. Renders ArgoCD Application from template
3. Creates the Application in ArgoCD
4. Comments on PR with access instructions

**Required Secret:**
- `KUBECONFIG`: Base64-encoded kubeconfig for cluster access

### Cleanup Preprod (`cleanup-preprod.yml`)

**Trigger**: PR closed or merged

**What it does:**
1. Checks if preprod exists for this PR
2. Deletes the ArgoCD Application
3. Deletes the namespace
4. Comments on PR confirming cleanup

## Setup: Adding KUBECONFIG Secret

For the workflows to work, you need to add your `KUBECONFIG` to GitHub Secrets:

```bash
# 1. Encode your kubeconfig
cat ~/.kube/config | base64 -w 0

# 2. Add to GitHub:
# Go to: Settings → Secrets and variables → Actions → New repository secret
# Name: KUBECONFIG
# Value: <paste the base64 output>
```

## Troubleshooting

### Preprod not deploying

Check the GitHub Action logs:
- Go to **Actions** tab
- Click on the failed workflow
- Review the logs

### Application stuck in "OutOfSync"

The application needs manual sync:
1. Open ArgoCD UI
2. Click on your application
3. Click **Sync** → **Synchronize**

### Can't access preprod

Check if pods are running:
```bash
kubectl get pods -n preprod-pr-{NUMBER}
```

Check service:
```bash
kubectl get svc -n preprod-pr-{NUMBER}
```

Port-forward the service:
```bash
kubectl port-forward -n preprod-pr-{NUMBER} \
  svc/cicd-project-pr-{NUMBER}-cicd-app-chart 8080:80
```

### Preprod not cleaned up

Manually delete:
```bash
# Delete Application (this will cascade delete all resources)
kubectl delete application cicd-project-pr-{NUMBER} -n argocd

# Delete namespace (if needed)
kubectl delete namespace preprod-pr-{NUMBER}
```

## Advanced Usage

### Deploy multiple preprods

You can have multiple PRs with preprods at the same time. Each gets its own:
- Namespace: `preprod-pr-123`, `preprod-pr-124`, etc.
- NodePort: `30123`, `30124`, etc.
- Port-forward: `8123`, `8124`, etc.

### Update preprod after new commits

After pushing new commits to your PR branch:
1. ArgoCD will detect the changes (takes ~3 minutes)
2. Go to ArgoCD UI
3. Click **Refresh** → **Hard Refresh**
4. Click **Sync**

### Test with custom values

You can manually modify the preprod Application in ArgoCD:
1. Go to ArgoCD UI
2. Click on your application
3. Click **App Details** → **Parameters**
4. Modify values (e.g., increase replicas, change image tag)
5. Sync

## Best Practices

### When to deploy preprod

✅ **Do deploy preprod when:**
- Feature is ready for testing
- You want to show something to the team
- You need to test integration with other services
- You want to verify the deployment works

❌ **Don't deploy preprod:**
- For every commit (wastes resources)
- Before code is working (test locally first)
- For draft PRs (unless specifically needed)

### Resource Management

Preprods use reduced resources:
- **App**: 100m CPU / 256Mi RAM (vs unlimited in prod)
- **PostgreSQL**: 100m CPU / 256Mi RAM, 1Gi storage (vs 8Gi in prod)
- **Replicas**: 1 (no autoscaling)

This allows multiple preprods to run simultaneously without overloading the cluster.

### Security

- Preprods use the same secrets as production (database credentials, API keys)
- Each preprod has an isolated database
- Network policies ensure isolation between preprods

## FAQ

**Q: How long does preprod deployment take?**
A: ~2-3 minutes after clicking Sync in ArgoCD.

**Q: Can I redeploy the same preprod?**
A: Yes, just comment `/deploy-preprod` again. It will update the existing Application.

**Q: What happens to preprod data after cleanup?**
A: All data is deleted (database, files, logs). Make sure to extract what you need before closing the PR.

**Q: Can I deploy preprod from a fork?**
A: No, the workflow only works for branches in the same repository (for security).

**Q: How many preprods can I have?**
A: Depends on cluster resources. Each preprod uses ~512Mi RAM total. Monitor with `kubectl top nodes`.

## Resources

- [ArgoCD Documentation](https://argo-cd.readthedocs.io/)
- [GitOps Principles](https://opengitops.dev/)
- [Helm Values Documentation](https://helm.sh/docs/chart_template_guide/values_files/)
