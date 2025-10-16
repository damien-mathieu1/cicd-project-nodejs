# ArgoCD Deployment Architecture

This directory contains ArgoCD manifests for managing GitOps-based deployments of the Node.js application.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      GitHub Repository                       │
│  ┌─────────────────────────────────────────────────────────┤
│  │  main branch  →  Production (default namespace)          │
│  │  PR branches  →  Preprod (preprod-pr-{number} namespace) │
│  └─────────────────────────────────────────────────────────┘
└───────────────────────┬──────────────────────────────────────┘
                        │
                  ArgoCD Monitors
                        │
┌───────────────────────▼──────────────────────────────────────┐
│              Local Kubernetes Cluster                         │
│  ┌──────────────────────────────────────────────────────────┐│
│  │  ArgoCD (argocd namespace)                               ││
│  │  ├── Production Application (manual)                     ││
│  │  └── ApplicationSet (automatic preprod management)       ││
│  └───────────────────┬──────────────────────────────────────┘│
│                      │                                         │
│        ┌─────────────┴─────────────┐                          │
│        │                           │                          │
│  ┌─────▼────────┐          ┌───────▼──────────┐              │
│  │ Production   │          │ Preprod Envs     │              │
│  │ (default)    │          │ (per PR)         │              │
│  │ - From main  │          │ - Auto created   │              │
│  │ - Auto-sync  │          │ - Label-based    │              │
│  │ - Full res.  │          │ - Reduced res.   │              │
│  └──────────────┘          └──────────────────┘              │
└──────────────────────────────────────────────────────────────┘
```

## Files in This Directory

### `production-application.yaml`

**Purpose**: Defines the production Application that deploys from the `main` branch.

**Key Configuration**:
- **Application Name**: `cicd-project-nodejs`
- **Namespace**: `default`
- **Branch**: `main`
- **Sync Policy**: Automated (auto-prune, self-heal enabled)
- **Values File**: `values.yaml` (full production resources)

**Installation**:
```bash
kubectl apply -f .argocd/production-application.yaml
```

This is a **static** Application - it's manually created once and continuously monitors the main branch.

---

### `preprod-applicationset.yaml`

**Purpose**: Automatically creates and destroys preprod Applications based on PR labels.

**How It Works**:
1. ArgoCD polls GitHub API every 3 minutes
2. Detects Pull Requests with the `deploy-preprod` label
3. Automatically creates an Application for each labeled PR
4. When label is removed, Application is automatically deleted

**Key Configuration**:
- **Generator**: Pull Request Generator (GitHub)
- **Label Filter**: `deploy-preprod`
- **Polling Interval**: 180 seconds (3 minutes)
- **Template Variables**:
  - `{{number}}`: PR number (e.g., 123)
  - `{{branch}}`: PR branch name
  - `{{head_sha}}`: Commit SHA

**Installation**:
```bash
# First, create GitHub token secret (see SETUP_GITHUB_TOKEN.md)
kubectl create secret generic github-token \
  --from-literal=token=ghp_YOUR_TOKEN \
  -n argocd

# Then deploy the ApplicationSet
kubectl apply -f .argocd/preprod-applicationset.yaml
```

This is a **dynamic** generator - it automatically manages Applications without manual intervention.

---

### `SETUP_GITHUB_TOKEN.md`

Guide for creating a GitHub Fine-Grained Personal Access Token with proper permissions for the ApplicationSet.

---

### `APPLICATIONSET_SUMMARY.md`

Detailed technical summary of the ApplicationSet implementation, including architecture diagrams, troubleshooting, and design decisions.

---

## Deployment Strategy

### Production Environment

| Property | Value |
|----------|-------|
| **Application** | `cicd-project-nodejs` |
| **Namespace** | `default` |
| **Branch** | `main` |
| **Managed By** | Static Application manifest |
| **Sync** | Automatic (on every push to main) |
| **Values** | `values.yaml` (full resources) |
| **Service Type** | LoadBalancer |
| **Access** | Port-forward or LoadBalancer IP |

**Production is stable and always running.**

---

### Preprod Environments

| Property | Value |
|----------|-------|
| **Application** | `cicd-project-pr-{NUMBER}` (auto-generated) |
| **Namespace** | `preprod-pr-{NUMBER}` (auto-created) |
| **Branch** | PR branch (e.g., `feat/awesome`) |
| **Managed By** | ApplicationSet |
| **Trigger** | `deploy-preprod` label on PR |
| **Sync** | Automatic (on every push to PR branch) |
| **Values** | `values-preprod.yaml` (reduced resources) |
| **Service Type** | NodePort |
| **NodePort** | `30000 + PR_NUMBER` (auto-calculated) |
| **Access** | Port-forward or NodePort |

**Preprods are ephemeral and isolated per Pull Request.**

---

## Developer Workflow

### Deploy Production (Automatic)

Production automatically deploys when changes are pushed to `main`:

```bash
git checkout main
git pull
# Make changes
git commit -am "Production update"
git push origin main
# ArgoCD automatically syncs (~30 seconds)
```

### Deploy Preprod (Manual Trigger)

#### Step 1: Create Pull Request

```bash
git checkout -b feat/awesome-feature
# Make changes
git commit -am "Implement awesome feature"
git push origin feat/awesome-feature
# Create PR on GitHub
```

#### Step 2: Deploy Preprod

Comment on the PR:
```
/deploy-preprod
```

**What happens**:
1. GitHub Action adds `deploy-preprod` label to the PR
2. ArgoCD ApplicationSet polls GitHub (~3 minutes)
3. ApplicationSet detects the label and creates an Application
4. Application automatically syncs and deploys

**Timeline**: 3-5 minutes total

#### Step 3: Access Preprod

```bash
# Find your preprod namespace
kubectl get namespaces | grep preprod

# Port-forward to access (easiest)
kubectl port-forward -n preprod-pr-123 \
  svc/cicd-project-pr-123-cicd-app-chart 8123:80

# Then open: http://localhost:8123
```

**Or via NodePort** (if you have node external IP):
- URL: `http://<node-ip>:30123` (30000 + PR number)

#### Step 4: Update Preprod

Every new commit pushed to the PR branch automatically syncs:

```bash
git commit -am "Fix bug"
git push
# ArgoCD automatically syncs (~30 seconds)
```

#### Step 5: Destroy Preprod

**Manual destruction** (optional):
```
/destroy-preprod
```

**Automatic destruction**:
When you close or merge the PR, the `deploy-preprod` label is automatically removed and the preprod is cleaned up.

---

## How ApplicationSet Works (Technical)

### Traditional Approach (Doesn't Work for Local Cluster)

```
GitHub Action → kubectl apply → Local Cluster  ❌
(GitHub can't reach your local machine)
```

### ApplicationSet Approach (Works!)

```
ArgoCD (in cluster) → Polls GitHub API → Detects labels → Creates Apps  ✅
(ArgoCD initiates the connection, no inbound access needed)
```

### Pull Request Generator

The ApplicationSet uses a **Pull Request Generator** that:

1. **Polls GitHub API** every 180 seconds
2. **Filters PRs** with `labels: [deploy-preprod]`
3. **Generates Applications** using the template
4. **Substitutes variables**:
   - `{{number}}` → PR number (e.g., 123)
   - `{{branch}}` → PR branch name
   - `{{head_sha}}` → Commit SHA

### Application Template

For each PR, the ApplicationSet creates an Application with:

```yaml
name: cicd-project-pr-{{number}}
namespace: argocd

spec:
  source:
    targetRevision: {{head_sha}}
    path: cicd-app-chart
    helm:
      valueFiles:
        - values-preprod.yaml
      parameters:
        - name: prNumber
          value: "{{number}}"

  destination:
    namespace: preprod-pr-{{number}}

  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

**Key Features**:
- **Isolated namespace** per PR
- **Automatic sync** on code changes
- **Self-healing** if resources are manually modified
- **Auto-prune** removes deleted resources
- **Namespace auto-creation** on first deploy

---

## Resource Isolation

### Production Resources

- **Replicas**: 2
- **CPU**: 1000m limit
- **Memory**: 1024Mi limit
- **PostgreSQL**: 8Gi storage

### Preprod Resources (Per PR)

- **Replicas**: 1
- **CPU**: 500m limit
- **Memory**: 512Mi limit (256Mi for app + 256Mi for PostgreSQL)
- **PostgreSQL**: 1Gi storage

**Why reduced resources?**
- Multiple preprods can run simultaneously
- Testing doesn't need production scale
- Saves cluster resources

---

## Monitoring Commands

### List All Applications

```bash
# All applications
kubectl get applications -n argocd

# Only preprods
kubectl get applications -n argocd -l app.kubernetes.io/environment=preprod
```

### Check Specific Preprod

```bash
# Application status
kubectl get application cicd-project-pr-123 -n argocd

# Pods in preprod
kubectl get pods -n preprod-pr-123

# Services
kubectl get svc -n preprod-pr-123

# Logs
kubectl logs -n preprod-pr-123 -l app.kubernetes.io/name=cicd-app-chart
```

### Check ApplicationSet

```bash
# ApplicationSet status
kubectl get applicationset -n argocd

# ApplicationSet logs
kubectl logs -n argocd deployment/argocd-applicationset-controller
```

### Force Refresh

```bash
# Restart ApplicationSet controller (forces immediate poll)
kubectl delete pod -n argocd -l app.kubernetes.io/name=argocd-applicationset-controller
```

---

## Troubleshooting

### Preprod Not Deploying

**Symptoms**: Comment `/deploy-preprod` but no Application appears after 5 minutes.

**Checks**:

1. Verify label exists:
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

Should return JSON array of PRs. If `401 Unauthorized`, regenerate the token.

4. Force ApplicationSet refresh:
```bash
kubectl delete pod -n argocd -l app.kubernetes.io/name=argocd-applicationset-controller
```

---

### Application Created But Not Syncing

**Symptoms**: Application exists but pods never appear.

**Checks**:

1. Check Application status:
```bash
kubectl get application cicd-project-pr-123 -n argocd -o yaml
```

Look for `status.sync.status` and `status.health.status`.

2. Check ArgoCD UI for detailed errors:
```
http://localhost:8080/applications/cicd-project-pr-123
```

3. Manually trigger sync:
```bash
# Via CLI
argocd app sync cicd-project-pr-123

# Or in ArgoCD UI: click "Sync" button
```

---

### Preprod Not Cleaning Up

**Symptoms**: PR closed but preprod still exists.

**Checks**:

1. Verify label was removed:
```bash
gh pr view 123 --json labels
```

2. Manually remove label:
```bash
gh pr edit 123 --remove-label "deploy-preprod"
```

3. Or directly delete Application:
```bash
kubectl delete application cicd-project-pr-123 -n argocd
```

---

## Advantages of This Architecture

| Feature | Traditional CI/CD | ApplicationSet |
|---------|------------------|----------------|
| **Works with local cluster** | ❌ No | ✅ Yes |
| **Automatic deployment** | ⚠️ Manual trigger | ✅ Automatic |
| **Automatic cleanup** | ⚠️ Needs workflow | ✅ Built-in |
| **Self-healing** | ❌ No | ✅ Yes |
| **GitOps native** | ❌ No | ✅ Yes |
| **Requires cluster access from GitHub** | ✅ Yes (KUBECONFIG) | ❌ No (just GitHub token) |
| **Deployment delay** | Instant | ~3 minutes |

---

## Security

### GitHub Token
- **Permissions**: Read-only access to Pull Requests
- **Scope**: Repository-specific (fine-grained token)
- **Storage**: Kubernetes Secret in `argocd` namespace

### Isolation
- Each preprod has isolated namespace
- Separate PostgreSQL instance per preprod
- Network policies enforced
- All resources deleted on cleanup

### Production Protection
- Production is in `default` namespace
- Preprods are in separate namespaces (`preprod-pr-*`)
- No cross-namespace access

---

## Additional Resources

- [PREPROD_WORKFLOW.md](../PREPROD_WORKFLOW.md) - User guide for preprod deployments
- [SETUP_GITHUB_TOKEN.md](SETUP_GITHUB_TOKEN.md) - GitHub token setup
- [APPLICATIONSET_SUMMARY.md](APPLICATIONSET_SUMMARY.md) - Technical deep dive
- [ArgoCD ApplicationSet Docs](https://argo-cd.readthedocs.io/en/stable/user-guide/application-set/)
- [Pull Request Generator Docs](https://argo-cd.readthedocs.io/en/stable/operator-manual/applicationset/Generators-Pull-Request/)
