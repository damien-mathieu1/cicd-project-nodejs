# ArgoCD Helm Chart

This Helm chart installs ArgoCD in your Kubernetes cluster and automatically configures an ArgoCD Application to deploy the cicd-project-nodejs project from GitHub.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.0+
- Access to your Kubernetes cluster
- GitHub repository (private or public)

## Complete Installation Guide

### Step 1: Update Chart Dependencies

```bash
cd argocd-chart
helm dependency update
```

This downloads the official ArgoCD Helm chart as a dependency.

### Step 2: Install ArgoCD

```bash
helm install argocd . --namespace argocd --create-namespace
```

Wait for all ArgoCD components to be ready:

```bash
kubectl wait --for=condition=available --timeout=600s deployment/argocd-server -n argocd
```

### Step 3: Configure SSH Access for Private GitHub Repository

ArgoCD needs SSH credentials to access your private GitHub repository.

#### 3.1 Generate SSH Deploy Key

```bash
ssh-keygen -t ed25519 -C "argocd-deploy-key" -f /tmp/argocd-deploy-key -N ""
```

#### 3.2 Display the Public Key

```bash
cat /tmp/argocd-deploy-key.pub
```

Copy the output (starts with `ssh-ed25519 ...`).

#### 3.3 Add Deploy Key to GitHub

1. Go to your repository on GitHub
2. Navigate to: **Settings** → **Deploy keys** → **Add deploy key**
3. Title: `argocd-deploy-key`
4. Key: Paste the public key from step 3.2
5. **DO NOT** check "Allow write access" (read-only is sufficient)
6. Click **Add key**

#### 3.4 Create Kubernetes Secret with Private Key

```bash
kubectl create secret generic github-ssh-key \
  --from-file=sshPrivateKey=/tmp/argocd-deploy-key \
  -n argocd
```

#### 3.5 Label the Secret for ArgoCD

```bash
kubectl label secret github-ssh-key -n argocd argocd.argoproj.io/secret-type=repository
```

#### 3.6 Add Repository URL to Secret

```bash
kubectl patch secret github-ssh-key -n argocd \
  -p '{"stringData": {"url": "git@github.com:damien-mathieu1/cicd-project-nodejs.git", "type": "git"}}'
```

**Note:** Replace the repository URL with your own if different.

### Step 4: Force Application Refresh

Trigger ArgoCD to reload the application with the new SSH credentials:

```bash
kubectl patch application cicd-project-nodejs -n argocd \
  --type merge \
  -p '{"metadata": {"annotations": {"argocd.argoproj.io/refresh": "hard"}}}'
```

### Step 5: Access ArgoCD UI

#### Option A: Port Forward (Recommended for Development)

```bash
kubectl port-forward svc/argocd-server -n argocd 8080:80
```

Then open: http://localhost:8080

#### Option B: LoadBalancer (If Available)

```bash
kubectl get svc argocd-server -n argocd
```

Access the EXTERNAL-IP shown.

### Step 6: Get Admin Credentials

**Username:** `admin`

**Password:**
```bash
kubectl get secret argocd-initial-admin-secret -n argocd \
  -o jsonpath="{.data.password}" | base64 -d && echo
```

### Step 7: Deploy the Production Application

Now that ArgoCD is installed, deploy your production application:

```bash
kubectl apply -f .argocd/production-application.yaml
```

Wait for the application to sync:

```bash
kubectl wait --for=jsonpath='{.status.sync.status}'=Synced \
  application/cicd-project-nodejs -n argocd --timeout=600s
```

### Step 8: Verify Deployment

Check the application status:

```bash
kubectl get application -n argocd cicd-project-nodejs
```

Check deployed resources:

```bash
kubectl get pods -n default
```

You should see:
- `cicd-project-nodejs-cicd-app-chart-*` (your Node.js app)
- `cicd-project-nodejs-postgresql-*` (database)
- Migration job (may be completed or running)

## Configuration

### Customize Repository Settings

Edit `values.yaml` to point to your own repository:

```yaml
application:
  source:
    repoURL: git@github.com:your-username/your-repo.git
    targetRevision: main
    path: cicd-app-chart
```

### Sync Policy

The chart is configured with automatic sync:

- **`prune: true`** - Deletes resources removed from Git
- **`selfHeal: true`** - Automatically reverts manual changes to match Git state
- **`CreateNamespace: true`** - Creates the target namespace if it doesn't exist

This means:
- Every push to `main` triggers automatic deployment
- Manual changes to resources are reverted to Git state
- Deleting manifests from Git deletes the resources from the cluster

## Troubleshooting

### Application Shows "ComparisonError"

Check if SSH credentials are configured:

```bash
kubectl get secret github-ssh-key -n argocd
```

View application status:

```bash
kubectl get application cicd-project-nodejs -n argocd -o yaml
```

Check repo-server logs:

```bash
kubectl logs -n argocd deployment/argocd-repo-server --tail=50
```

### Application Stuck in "OutOfSync"

Manually trigger sync:

```bash
kubectl patch application cicd-project-nodejs -n argocd \
  --type merge \
  -p '{"metadata": {"annotations": {"argocd.argoproj.io/refresh": "hard"}}}'
```

Or sync via UI: Click **Sync** → **Synchronize**

## Uninstallation

Remove the ArgoCD application and all deployed resources:

```bash
helm uninstall argocd -n argocd
kubectl delete namespace argocd
```

**Note:** This will also delete all resources deployed by ArgoCD (your application, database, etc.)

## Chart Structure

```
argocd-chart/
├── Chart.yaml              # Chart metadata and dependencies
├── values.yaml             # Configuration values
├── templates/
│   └── application.yaml    # ArgoCD Application resource template
├── .helmignore            # Files to ignore when packaging
└── README.md              # This file
```

## GitOps Workflow

Once configured, the workflow is:

1. **Push changes to `main` branch** on GitHub
2. **ArgoCD detects changes** (polls every 3 minutes by default)
3. **ArgoCD compares** Git state vs Cluster state
4. **ArgoCD syncs automatically** (deploys changes)
5. **Self-healing**: Any manual changes are reverted to Git state

**Git is the single source of truth.**

## Security Notes

- The deploy key has **read-only** access to the repository
- For production, consider using HTTPS with proper TLS certificates
- Change the default admin password after first login
- Consider using RBAC to restrict access to ArgoCD resources

## Further Reading

- [ArgoCD Documentation](https://argo-cd.readthedocs.io/)
- [ArgoCD Best Practices](https://argo-cd.readthedocs.io/en/stable/user-guide/best_practices/)
- [GitOps Principles](https://opengitops.dev/)
