# ArgoCD Applications

This directory contains ArgoCD Application manifests for managing deployments.

## Files

### `production-application.yaml`

Production application manifest that deploys from the `main` branch.

**Installation:**
```bash
kubectl apply -f .argocd/production-application.yaml
```

This creates the production application in the `default` namespace with automatic sync enabled.

### `preprod-application-template.yaml`

Template for creating preprod ArgoCD Applications from Pull Requests.

**Variables replaced by GitHub Actions:**
- `{{PR_NUMBER}}`: Pull Request number (e.g., 123)
- `{{PR_BRANCH}}`: PR branch name (e.g., feat/awesome-feature)
- `{{PR_HEAD_SHA}}`: Git commit SHA of the PR
- `{{NODEPORT}}`: NodePort (calculated as 30000 + PR_NUMBER)

**Example usage:**
```bash
# Replace placeholders
sed -e "s/{{PR_NUMBER}}/123/g" \
    -e "s/{{PR_BRANCH}}/feat\/awesome/g" \
    -e "s/{{PR_HEAD_SHA}}/abc123def/g" \
    -e "s/{{NODEPORT}}/30123/g" \
    preprod-application-template.yaml | kubectl apply -f -
```

## Deployment Strategy

### Production (main branch)
- **Application**: `cicd-project-nodejs`
- **Namespace**: `default`
- **Sync**: Automated (auto-deploy on every push to main)
- **Config**: `values.yaml`

### Preprod (PR branches)
- **Application**: `cicd-project-pr-{NUMBER}`
- **Namespace**: `preprod-pr-{NUMBER}`
- **Sync**: Manual (triggered by `/deploy-preprod` comment)
- **Config**: `values-preprod.yaml`
- **Access**: NodePort `30000 + PR_NUMBER`

## Workflow

1. Developer creates a Pull Request
2. Developer comments `/deploy-preprod` in the PR
3. GitHub Action:
   - Renders the template with PR info
   - Creates ArgoCD Application
   - Application deploys to `preprod-pr-{NUMBER}` namespace
4. Developer manually syncs the Application in ArgoCD UI
5. When PR is closed/merged:
   - GitHub Action deletes the Application
   - Namespace is automatically cleaned up
