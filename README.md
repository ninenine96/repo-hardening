# repo-hardening

A GitHub Actions toolkit that transforms any repo into a public contribution-ready project in one run.

## What it does

| Step | What gets applied |
|------|-------------------|
| 🔒 Branch protection | Requires PR + 1 approval, blocks force-push and deletion, requires conversation resolution |
| 🏷️ Labels | 19-label taxonomy: contribution tiers, type, status, priority |
| 📄 Community files | LICENSE (MIT), CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md |
| 📋 Templates | PR template, bug report, feature request, contributor access request, blank issues disabled |
| ⚙️ Repo settings | Squash-merge only, auto-delete branches, issues on, sets repo description |
| 🤖 Dependabot | Weekly dependency updates for npm and GitHub Actions |
| 🧹 Stale bot | Marks issues/PRs stale after 60 days, closes after 14 more |
| 🏷️ Topics | Sets repo topics for discoverability |

All steps are idempotent — re-running updates existing files and settings without duplicating anything.

## Setup

### 1. Create a PAT

Go to **GitHub → Settings → Developer Settings → Personal access tokens (classic)** and create a token with:
- `repo` scope (full)
- `workflow` scope (required to push the stale bot workflow to target repos)

### 2. Add secrets to your hardening repo

| Secret | Value |
|--------|-------|
| `HARDENING_PAT` | Your PAT from step 1 |
| `DISCORD_WEBHOOK` | Your Discord channel webhook URL (optional) |

### 3. Run it

Go to **Actions → "Harden Repository for Public Contributions" → Run workflow.**

| Input | Description |
|-------|-------------|
| `target_repo` | `owner/repo` or any GitHub URL — leave blank to harden this repo itself |
| `default_branch` | Leave blank to auto-detect (`main`, `master`, etc.) |
| `project_description` | Sets the repo description on GitHub and in generated files |
| `topics` | Comma-separated topics e.g. `automation, github-actions` |
| `discord_announce` | Posts a Discord embed when done (requires `DISCORD_WEBHOOK` secret) |

**Batch mode:** Add repos to `repos.txt` (one per line), flip `if: false` to `if: true` in the `harden-batch` job, and trigger the workflow.

## Customising the templates

All generated files are rendered from `templates/` — edit them there so your changes persist across re-runs on any repo:

| Template | Destination | Dynamic vars |
|----------|-------------|--------------|
| `templates/LICENSE` | `LICENSE` | `{{year}}`, `{{ownerName}}` |
| `templates/CONTRIBUTING.md` | `CONTRIBUTING.md` | `{{repo}}`, `{{defaultBranch}}` |
| `templates/CODE_OF_CONDUCT.md` | `CODE_OF_CONDUCT.md` | — |
| `templates/SECURITY.md` | `SECURITY.md` | `{{repoUrl}}` |
| `templates/dependabot.yml` | `.github/dependabot.yml` | — |
| `templates/pr_template/PULL_REQUEST_TEMPLATE.md` | `.github/PULL_REQUEST_TEMPLATE.md` | `{{defaultBranch}}` |
| `templates/issue_templates/config.yml` | `.github/ISSUE_TEMPLATE/config.yml` | `{{repoUrl}}` |
| `templates/issue_templates/bug_report.md` | `.github/ISSUE_TEMPLATE/bug_report.md` | — |
| `templates/issue_templates/feature_request.md` | `.github/ISSUE_TEMPLATE/feature_request.md` | — |
| `templates/issue_templates/contributor_access.md` | `.github/ISSUE_TEMPLATE/contributor_access.md` | — |
| `templates/stale.yml` | `.github/workflows/stale.yml` | — |

## Discord integration

When `discord_announce` is checked and `DISCORD_WEBHOOK` is set, the workflow posts an embed to your Discord announcing the repo is open for contributions.

To get a webhook URL: Discord channel → **Edit Channel → Integrations → Webhooks → New Webhook.**
