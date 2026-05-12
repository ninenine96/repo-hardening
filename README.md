# repo-hardening

A GitHub Actions toolkit that transforms any repo into a public contribution-ready project in one run.

## What it does

| Step | What gets applied |
|------|-------------------|
| 🔒 Branch protection | Requires PR + 1 approval, blocks force-push and deletion, requires conversation resolution |
| 🏷️ Labels | Full label taxonomy: contribution tiers, type, status, priority |
| 📄 Community files | CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md |
| 📋 Templates | PR template, bug report, feature request, contributor access request |
| ⚙️ Repo settings | Squash-merge only, auto-delete branches, issues on |

## Setup

### 1. Create a PAT

Go to **GitHub → Settings → Developer Settings → Personal access tokens (classic)** and create a token with:
- `repo` scope (full)
- `admin:repo_hook` if you want webhook control

### 2. Add secrets to your hardening repo

| Secret | Value |
|--------|-------|
| `HARDENING_PAT` | Your PAT from step 1 |
| `DISCORD_WEBHOOK` | Your Discord channel webhook URL (optional) |

### 3. Run it

**Single repo:** Go to Actions → "Harden Repository" → Run workflow. Fill in the target repo as `owner/repo`.

**Batch mode:** Add repos to `repos.txt` (one per line), set `if: false` to `if: true` in the `harden-batch` job, and trigger the workflow.

**This repo itself:** Leave `target_repo` blank to harden the repo the workflow lives in.

## Customising after the run

The generated files are starting points — edit them to match your actual setup:

- `CONTRIBUTING.md` — add your real local dev setup commands
- `SECURITY.md` — add your contact email
- `.github/ISSUE_TEMPLATE/contributor_access.md` — adjust the criteria for granting access

## Discord integration

When `discord_announce` is true and `DISCORD_WEBHOOK` is set, the workflow posts an embed to your Discord when hardening completes — useful if you're announcing a repo going public to your community.

To get a webhook URL: Discord channel → Edit Channel → Integrations → Webhooks → New Webhook.
