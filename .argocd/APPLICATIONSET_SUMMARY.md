# ApplicationSet Implementation Summary

## What Was Implemented

A complete GitOps preprod deployment system using ArgoCD ApplicationSet that works with your **local Kubernetes cluster**.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      GitHub Repository                       │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                     │
│  │  PR #1  │  │  PR #2  │  │  PR #3  │                     │
│  │ (label) │  │ (label) │  │(no label)│                     │
│  └────┬────┘  └────┬────┘  └─────────┘                     │
└───────┼────────────┼──────────────────────────────────────┘
        │            │
        │  ArgoCD polls every 3 minutes
        │            │
┌───────▼────────────▼──────────────────────────────────────┐
│          Local Kubernetes Cluster                          │
│  ┌─────────────────────────────────────────────────────┐  │
│  │              ArgoCD ApplicationSet                   │  │
│  │  (monitors GitHub for PRs with deploy-preprod label)│  │
│  └─────────────────┬───────────────────────────────────┘  │
│                    │                                        │
│       ┌────────────┴─────────────┐                        │
│       │                           │                        │
│  ┌────▼────────┐          ┌──────▼───────┐               │
│  │ Application │          │ Application  │               │
│  │ pr-1        │          │ pr-2         │               │
│  │ (automated) │          │ (automated)  │               │
│  └────┬────────┘          └──────┬───────┘               │
│       │                           │                        │
│  ┌────▼────────┐          ┌──────▼───────┐               │
│  │ Namespace   │          │ Namespace    │               │
│  │ preprod-pr-1│          │ preprod-pr-2 │               │
│  │ - App       │          │ - App        │               │
│  │ - PostgreSQL│          │ - PostgreSQL │               │
│  │ - NodePort  │          │ - NodePort   │               │
│  └─────────────┘          └──────────────┘               │
└──────────────────────────────────────────────────────────┘
```

## Key Components

### 1. ApplicationSet (`.argocd/preprod-applicationset.yaml`)
- Polls GitHub every 3 minutes
- Looks for PRs with `deploy-preprod` label
- Automatically creates/deletes Applications
- No manual intervention needed after label is set

### 2. GitHub Workflows

**`preprod-label-manager.yml`**
- Trigger: Comment `/deploy-preprod` or `/destroy-preprod`
- Action: Adds/removes the `deploy-preprod` label
- No cluster access needed!

**`preprod-auto-cleanup.yml`**
- Trigger: PR closed/merged
- Action: Removes the `deploy-preprod` label
- ApplicationSet handles the actual cleanup

### 3. Helm Chart Enhancements

**`templates/service.yaml`**
- Auto-calculates NodePort: `30000 + PR_NUMBER`
- Uses `prNumber` parameter from ApplicationSet

**`values-preprod.yaml`**
- Reduced resources (512Mi RAM total)
- Smaller PostgreSQL (1Gi storage)
- NodePort service type

## Developer Workflow

```bash
# 1. Create PR
git checkout -b feat/awesome
git push

# 2. Trigger deployment (comment on PR)
/deploy-preprod

# 3. Wait ~3-5 minutes

# 4. Access preprod
kubectl port-forward -n preprod-pr-123 \
  svc/cicd-project-pr-123-cicd-app-chart 8123:80

# 5. Close PR → automatic cleanup
```

## Why This Works With Local Cluster

**Problem**: GitHub Actions can't access your local cluster.

**Solution**: ArgoCD (running in your cluster) polls GitHub API.

```
GitHub ← (poll) ← ArgoCD (local cluster)
```

ArgoCD initiates the connection, so no inbound access needed!

## Setup Steps

### 1. Create GitHub Token
```bash
# Create fine-grained token: https://github.com/settings/tokens?type=beta
# Permissions: Pull requests (Read-only)

kubectl create secret generic github-token \
  --from-literal=token=ghp_YOUR_TOKEN \
  -n argocd
```

### 2. Deploy ApplicationSet
```bash
kubectl apply -f .argocd/preprod-applicationset.yaml
```

### 3. Test
```bash
# Create a test PR
git checkout -b test/preprod
git push

# Comment /deploy-preprod on the PR
# Wait 3-5 minutes
# Check: kubectl get applications -n argocd
```

## Files Created/Modified

### New Files
- `.argocd/preprod-applicationset.yaml` - Main ApplicationSet
- `.argocd/SETUP_GITHUB_TOKEN.md` - Token setup guide
- `.github/workflows/preprod-label-manager.yml` - Label management
- `.github/workflows/preprod-auto-cleanup.yml` - Auto cleanup
- `PREPROD_WORKFLOW.md` - Complete user guide
- `APPLICATIONSET_SUMMARY.md` - This file

### Modified Files
- `cicd-app-chart/templates/service.yaml` - Auto NodePort calculation
- `cicd-app-chart/values-preprod.yaml` - Preprod config

### Removed Files
- `.github/workflows/deploy-preprod.yml` - Old approach (replaced)
- `.github/workflows/cleanup-preprod.yml` - Old approach (replaced)

## Advantages

✅ **Works with local cluster** - No network access needed
✅ **Fully automatic** - Label → deploy, PR close → cleanup
✅ **GitOps native** - Everything managed by ArgoCD
✅ **Self-healing** - Auto-syncs on changes
✅ **Isolated** - Each PR gets own namespace + database
✅ **Resource efficient** - Reduced limits for preprods
✅ **Scalable** - Support N concurrent preprods

## Limitations

⏱️ **3-minute delay** - ApplicationSet polls, not instant
- Can be improved with webhooks (complex for local)

🔒 **Label-based** - Anyone with PR access can trigger
- Could add GitHub team restrictions if needed

📊 **Resource usage** - Each preprod ~512Mi RAM
- Monitor with `kubectl top nodes`

## Monitoring

### Check ApplicationSet
```bash
kubectl get applicationset -n argocd
kubectl logs -n argocd deployment/argocd-applicationset-controller
```

### List all preprods
```bash
kubectl get applications -n argocd -l app.kubernetes.io/environment=preprod
```

### Check specific preprod
```bash
kubectl get application cicd-project-pr-123 -n argocd -o yaml
kubectl get pods -n preprod-pr-123
```

## Troubleshooting

### Preprod not created after 5 minutes

1. Check label exists:
```bash
gh pr view 123 --json labels
```

2. Check ApplicationSet logs:
```bash
kubectl logs -n argocd deployment/argocd-applicationset-controller --tail=50
```

3. Verify GitHub token:
```bash
TOKEN=$(kubectl get secret github-token -n argocd -o jsonpath='{.data.token}' | base64 -d)
curl -H "Authorization: token $TOKEN" \
  https://api.github.com/repos/damien-mathieu1/cicd-project-nodejs/pulls
```

### Force ApplicationSet refresh

```bash
# Restart the controller
kubectl delete pod -n argocd -l app.kubernetes.io/name=argocd-applicationset-controller
```

## Security

- GitHub token: **Read-only** access to PRs
- Each preprod: **Isolated namespace + database**
- Network policies: **Enforced isolation**
- Automatic cleanup: **No leftover resources**

## Next Steps

### Optional Enhancements

1. **Webhook for instant deploy** (requires exposing ArgoCD)
2. **Team-based label restrictions** (GitHub CODEOWNERS)
3. **Resource quotas** per preprod namespace
4. **Monitoring/alerting** for preprod health
5. **Automatic E2E tests** on preprod deploy

### Production Readiness

- [ ] Set GitHub token expiration reminder
- [ ] Document for team
- [ ] Add resource quotas
- [ ] Set up monitoring
- [ ] Test with multiple concurrent PRs

## Resources

- [ApplicationSet Docs](https://argo-cd.readthedocs.io/en/stable/user-guide/application-set/)
- [Pull Request Generator](https://argo-cd.readthedocs.io/en/stable/operator-manual/applicationset/Generators-Pull-Request/)
- [Complete Workflow Guide](../PREPROD_WORKFLOW.md)
