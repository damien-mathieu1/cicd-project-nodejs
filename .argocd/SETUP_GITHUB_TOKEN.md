# Setup GitHub Token for ArgoCD ApplicationSet

ArgoCD needs a GitHub Personal Access Token to read Pull Requests from your repository.

## Step 1: Create a Fine-Grained Personal Access Token

1. Go to GitHub: https://github.com/settings/tokens?type=beta
2. Click **Generate new token** (Fine-grained token)

### Token Configuration:

**Token name:** `argocd-pullrequest-reader`

**Expiration:** 90 days (or No expiration for testing)

**Repository access:**
- Select: **Only select repositories**
- Choose: `damien-mathieu1/cicd-project-nodejs`

**Repository permissions:**
- **Pull requests**: `Read-only` ✅
- **Metadata**: `Read-only` ✅ (automatically selected)

**Organization permissions:** (none needed)

**Account permissions:** (none needed)

3. Click **Generate token**
4. **Copy the token** (you won't see it again!)

## Step 2: Create Kubernetes Secret

Once you have the token, create a secret in your cluster:

```bash
kubectl create secret generic github-token \
  --from-literal=token=ghp_YOUR_TOKEN_HERE \
  -n argocd
```

Replace `ghp_YOUR_TOKEN_HERE` with your actual token.

## Step 3: Verify the Secret

```bash
kubectl get secret github-token -n argocd
kubectl get secret github-token -n argocd -o jsonpath='{.data.token}' | base64 -d && echo
```

## Security Notes

- This token only has **read access** to pull requests
- It's scoped to a single repository
- You can revoke it anytime from GitHub settings
- ArgoCD uses it to poll for PRs every 3 minutes

## Token Expiration

When the token expires, you'll need to:
1. Generate a new token (same steps)
2. Update the secret:
```bash
kubectl create secret generic github-token \
  --from-literal=token=ghp_NEW_TOKEN_HERE \
  -n argocd \
  --dry-run=client -o yaml | kubectl apply -f -
```

## Troubleshooting

### ApplicationSet shows "authentication failed"

Check the token is valid:
```bash
TOKEN=$(kubectl get secret github-token -n argocd -o jsonpath='{.data.token}' | base64 -d)
curl -H "Authorization: token $TOKEN" https://api.github.com/repos/damien-mathieu1/cicd-project-nodejs/pulls
```

Should return a JSON list of pull requests.

### Token expired

Generate a new token and update the secret (see above).
