# Preprod Deployment Workflow with ApplicationSet

This document describes how to deploy and test preprod environments for Pull Requests using ArgoCD ApplicationSet.

## Overview

This project uses **GitOps with ArgoCD ApplicationSet** to automatically manage preprod deployments:
- **Production**: Auto-deployed from `main` branch to `default` namespace
- **Preprod**: Auto-deployed from PR branches with `deploy-preprod` label to isolated `preprod-pr-{number}` namespaces

## How It Works

```
1. Dev creates PR
   ↓
2. Dev comments "/deploy-preprod"
   ↓
3. GitHub Action adds "deploy-preprod" label
   ↓
4. ArgoCD ApplicationSet detects label (~3 min)
   ↓
5. ApplicationSet creates Application automatically
   ↓
6. Application deploys preprod automatically
   ↓
7. PR closed → Label removed → Preprod deleted
```

**Key benefit**: ArgoCD runs in your local cluster and polls GitHub. No need for GitHub to access your machine!

## Setup (One-time)

### 1. Create GitHub Personal Access Token

Follow: [`.argocd/SETUP_GITHUB_TOKEN.md`](.argocd/SETUP_GITHUB_TOKEN.md)

**Summary:**
1. Go to https://github.com/settings/tokens?type=beta
2. Create fine-grained token with:
   - Repository: `cicd-project-nodejs`
   - Permissions: Pull requests (Read-only)
3. Create secret in cluster:
```bash
kubectl create secret generic github-token \
  --from-literal=token=ghp_YOUR_TOKEN_HERE \
  -n argocd
```

### 2. Deploy the ApplicationSet

```bash
kubectl apply -f .argocd/preprod-applicationset.yaml
```

Verify it's running:
```bash
kubectl get applicationset -n argocd
```

## Usage: Deploy a Preprod

### 1. Create a Pull Request

```bash
git checkout -b feat/awesome-feature
# Make your changes
git push origin feat/awesome-feature
# Create PR on GitHub
```

### 2. Deploy Preprod

When your feature is ready to test, **comment on your PR**:

```
/deploy-preprod
```

**What happens:**
1. GitHub Action adds the `deploy-preprod` label
2. ArgoCD ApplicationSet detects the label (polls every 3 minutes)
3. ApplicationSet automatically creates the Application
4. Application automatically syncs and deploys

**Timeline:** ~3-5 minutes total

### 3. Access Your Preprod

Once deployed (check ArgoCD UI or `kubectl get pods -n preprod-pr-{NUMBER}`):

```bash
# Port-forward (easiest)
kubectl port-forward -n preprod-pr-{NUMBER} \
  svc/cicd-project-pr-{NUMBER}-cicd-app-chart 8{NUMBER}:80

# Example for PR #123:
kubectl port-forward -n preprod-pr-123 \
  svc/cicd-project-pr-123-cicd-app-chart 8123:80

# Then open: http://localhost:8123
```

**Or via NodePort** (if your cluster has external node IPs):
- NodePort: `30000 + PR_NUMBER`
- Example PR #123: `http://<node-ip>:30123`

### 4. Destroy Preprod (Optional)

To manually destroy before closing the PR:

```
/destroy-preprod
```

This removes the label, triggering ApplicationSet to delete the preprod.

### 5. Automatic Cleanup

When you **close or merge the PR**, the preprod is automatically deleted:
1. GitHub Action removes the `deploy-preprod` label
2. ApplicationSet detects removal (~3 minutes)
3. Application and all resources deleted

## Architecture

### Production Environment
- **Application**: `cicd-project-nodejs`
- **Namespace**: `default`
- **Branch**: `main`
- **Managed by**: Manual Application manifest
- **Sync**: Automatic (push to main → deploy)
- **Values**: `values.yaml` (full resources)

### Preprod Environments
- **Application**: `cicd-project-pr-{NUMBER}` (auto-created)
- **Namespace**: `preprod-pr-{NUMBER}` (auto-created)
- **Branch**: PR branch (e.g., `feat/awesome`)
- **Managed by**: ApplicationSet
- **Trigger**: `deploy-preprod` label
- **Sync**: Automatic
- **Values**: `values-preprod.yaml` (reduced resources)
- **Access**: Port-forward or NodePort `30000+{NUMBER}`

## Resource Isolation

Each preprod has:
- ✅ Isolated namespace
- ✅ Isolated PostgreSQL database
- ✅ Reduced resources (CPU/Memory)
- ✅ Automatic NodePort (30000 + PR number)
- ✅ Independent from production
- ✅ Automatic cleanup on PR close

## Commands Reference

### Deploy preprod
Comment on PR: `/deploy-preprod`

### Destroy preprod manually
Comment on PR: `/destroy-preprod`

### Check preprod status
```bash
# List all preprods
kubectl get applications -n argocd -l app.kubernetes.io/environment=preprod

# Check specific preprod
kubectl get application cicd-project-pr-123 -n argocd

# Check pods
kubectl get pods -n preprod-pr-123

# Check service
kubectl get svc -n preprod-pr-123
```

### Access preprod
```bash
# Port-forward
kubectl port-forward -n preprod-pr-123 svc/cicd-project-pr-123-cicd-app-chart 8123:80

# Or get NodePort
kubectl get svc -n preprod-pr-123 cicd-project-pr-123-cicd-app-chart -o jsonpath='{.spec.ports[0].nodePort}'
```

### View logs
```bash
kubectl logs -n preprod-pr-123 -l app.kubernetes.io/name=cicd-app-chart
```

### Manually sync in ArgoCD
1. Open ArgoCD UI: http://localhost:8080
2. Find application: `cicd-project-pr-{NUMBER}`
3. Click **Refresh** → **Hard Refresh**
4. Click **Sync** → **Synchronize**

## Configuration Files

```
.argocd/
├── production-application.yaml     # Prod Application (manual)
├── preprod-applicationset.yaml     # ApplicationSet (auto preprods)
├── SETUP_GITHUB_TOKEN.md          # Token setup guide
└── README.md

.github/workflows/
├── preprod-label-manager.yml      # Add/remove label on /deploy-preprod
└── preprod-auto-cleanup.yml       # Remove label when PR closes

cicd-app-chart/
├── values.yaml                     # Production config
├── values-preprod.yaml             # Preprod config (lighter)
└── templates/service.yaml          # Auto-calculates NodePort from prNumber
```

## How ApplicationSet Works

The ApplicationSet continuously polls GitHub (every 3 minutes) for:
- Open Pull Requests
- With label: `deploy-preprod`

For each matching PR, it automatically creates an Application using the template.

**Pull Request Generator Variables:**
- `{{number}}`: PR number (e.g., 123)
- `{{branch}}`: PR branch name
- `{{head_sha}}`: Commit SHA
- `{{head_short_sha}}`: Short commit SHA

These are automatically substituted in the Application template.

## Troubleshooting

### Preprod not deploying after `/deploy-preprod`

1. Check the label was added:
```bash
gh pr view 123 --json labels
```

2. Check ApplicationSet is running:
```bash
kubectl get applicationset -n argocd
kubectl logs -n argocd deployment/argocd-applicationset-controller
```

3. Wait 3-5 minutes (ApplicationSet polls every 3 min)

4. Force refresh:
```bash
kubectl delete pod -n argocd -l app.kubernetes.io/name=argocd-applicationset-controller
```

### GitHub token issues

Check token is valid:
```bash
TOKEN=$(kubectl get secret github-token -n argocd -o jsonpath='{.data.token}' | base64 -d)
curl -H "Authorization: token $TOKEN" \
  https://api.github.com/repos/damien-mathieu1/cicd-project-nodejs/pulls
```

Should return JSON list of PRs. If `401 Unauthorized`, regenerate the token.

### Application created but not syncing

Check Application status:
```bash
kubectl get application cicd-project-pr-123 -n argocd -o yaml
```

The `syncPolicy` is set to `automated`, so it should sync automatically. If not:
1. Check ArgoCD UI for sync errors
2. Manually trigger sync in UI
3. Check repo SSH key is configured

### Preprod not cleaning up

Check the label was removed:
```bash
gh pr view 123 --json labels
```

Manually remove if needed:
```bash
gh pr edit 123 --remove-label "deploy-preprod"
```

Or directly delete the Application:
```bash
kubectl delete application cicd-project-pr-123 -n argocd
```

### Multiple preprods at once

You can have as many preprods as you want (limited by cluster resources). Each PR with the label gets its own isolated environment.

Check all preprods:
```bash
kubectl get applications -n argocd -l app.kubernetes.io/environment=preprod
```

## Best Practices

### When to deploy preprod

✅ **Do deploy preprod when:**
- Feature is complete and ready for testing
- You want to demo to the team
- You need to test integration
- Before requesting review

❌ **Don't deploy preprod:**
- For every commit (wastes resources)
- For draft/WIP PRs (unless specifically needed)
- If you can test locally

### Resource Management

Each preprod uses:
- **App**: 100m CPU / 256Mi RAM
- **PostgreSQL**: 100m CPU / 256Mi RAM, 1Gi storage
- **Total**: ~512Mi RAM per preprod

Monitor cluster resources:
```bash
kubectl top nodes
kubectl top pods -n preprod-pr-123
```

### Security

- The GitHub token has **read-only** access to PRs
- Each preprod has an isolated database
- Network policies enforce isolation
- All data is deleted on cleanup

## Advantages Over GitHub Actions Approach

| Feature | GitHub Actions | ApplicationSet |
|---------|---------------|----------------|
| **Works with local cluster** | ❌ No | ✅ Yes |
| **Automatic deployment** | ❌ Manual trigger | ✅ Automatic |
| **Automatic cleanup** | ✅ Yes | ✅ Yes |
| **Delay** | Instant | ~3 minutes |
| **GitOps native** | ❌ No | ✅ Yes |
| **Requires KUBECONFIG secret** | ✅ Yes | ❌ No (just GitHub token) |
| **Self-healing** | ❌ No | ✅ Yes |

## FAQ

**Q: Why does it take 3 minutes to deploy?**
A: ApplicationSet polls GitHub every 3 minutes (configurable). This is normal for local clusters.

**Q: Can I speed up detection?**
A: Yes, with a GitHub webhook, but that requires exposing ArgoCD to the internet (complex for local setup).

**Q: What if I push new commits to the PR?**
A: ApplicationSet will detect the new commit SHA and ArgoCD will automatically sync the update.

**Q: Can I have preprods for multiple PRs?**
A: Yes! Each PR with the label gets its own isolated preprod.

**Q: What happens if I close the PR without merging?**
A: Same cleanup process - the preprod is automatically deleted.

## Resources

- [ArgoCD ApplicationSet Documentation](https://argo-cd.readthedocs.io/en/stable/user-guide/application-set/)
- [Pull Request Generator](https://argo-cd.readthedocs.io/en/stable/operator-manual/applicationset/Generators-Pull-Request/)
- [GitHub Fine-Grained Tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token)
