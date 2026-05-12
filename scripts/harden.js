// harden.js — applies branch protection, labels, and community files to a target repo
// Requires: GH_TOKEN (PAT with repo scope), TARGET_REPO (owner/repo or GitHub URL)

const { Octokit } = require("@octokit/rest");
const fs = require("fs");
const path = require("path");

const TEMPLATES_DIR = path.join(__dirname, "../templates");

function loadTemplate(filePath, vars) {
  const raw = fs.readFileSync(path.join(TEMPLATES_DIR, filePath), "utf8");
  return raw.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

const octokit = new Octokit({ auth: process.env.GH_TOKEN });

function parseRepo(input) {
  if (!input) return [null, null];
  // Strip trailing slashes, .git suffix, query strings, fragments
  const cleaned = input.trim().replace(/\.git$/, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
  // Full URL: https://github.com/owner/repo or github.com/owner/repo (with or without protocol)
  const urlMatch = cleaned.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (urlMatch) return [urlMatch[1], urlMatch[2]];
  // owner/repo shorthand
  const shortMatch = cleaned.match(/^([^/]+)\/([^/]+)$/);
  if (shortMatch) return [shortMatch[1], shortMatch[2]];
  return [null, null];
}

const [owner, repo] = parseRepo(process.env.TARGET_REPO);
const projectDescription = process.env.PROJECT_DESCRIPTION || "";

if (!owner || !repo) {
  console.error("❌ TARGET_REPO must be owner/repo or a GitHub URL (e.g. https://github.com/owner/repo)");
  process.exit(1);
}

async function resolveDefaultBranch() {
  if (process.env.DEFAULT_BRANCH) return process.env.DEFAULT_BRANCH;
  const { data } = await octokit.repos.get({ owner, repo });
  console.log(`  ℹ  Auto-detected default branch: ${data.default_branch}`);
  return data.default_branch;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

async function upsertFile(filePath, content, commitMessage, defaultBranch) {
  let sha;
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path: filePath });
    sha = data.sha;
    console.log(`  ↺  Updating ${filePath}`);
  } catch (e) {
    if (e.status !== 404) throw e;
    console.log(`  +  Creating ${filePath}`);
  }

  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    message: commitMessage,
    content: Buffer.from(content).toString("base64"),
    ...(sha ? { sha } : {}),
    branch: defaultBranch,
  });
}

async function ensureLabel(name, color, description) {
  try {
    await octokit.issues.updateLabel({ owner, repo, name, color, description });
    console.log(`  ↺  Label: ${name}`);
  } catch (e) {
    if (e.status !== 404) {
      console.warn(`  !  Could not update label "${name}": ${e.message}`);
      return;
    }
    try {
      await octokit.issues.createLabel({ owner, repo, name, color, description });
      console.log(`  +  Label: ${name}`);
    } catch (ce) {
      console.warn(`  !  Could not create label "${name}": ${ce.message}`);
    }
  }
}

// ─────────────────────────────────────────────
// 1. Branch protection
// ─────────────────────────────────────────────

async function applyBranchProtection(defaultBranch) {
  console.log("📌 Applying branch protection rules...");
  try {
    await octokit.repos.updateBranchProtection({
      owner,
      repo,
      branch: defaultBranch,
      required_status_checks: null,         // set to { strict: true, contexts: [] } if you have CI
      enforce_admins: false,                  // keep false so maintainers can hotfix
      required_pull_request_reviews: {
        required_approving_review_count: 1,
        dismiss_stale_reviews: true,
        require_code_owner_reviews: false,    // flip to true once CODEOWNERS is populated
      },
      restrictions: null,                     // no push restrictions beyond PR requirement
      allow_force_pushes: false,
      allow_deletions: false,
      required_linear_history: false,         // flip to true if you want squash-only merges
      required_conversation_resolution: true,
    });
    console.log("  ✓  Branch protection applied\n");
  } catch (e) {
    // Free-tier public repos: branch protection requires admin access
    console.warn(`  !  Branch protection failed (may need admin PAT or free-tier limit): ${e.message}\n`);
  }
}

// ─────────────────────────────────────────────
// 2. Labels
// ─────────────────────────────────────────────

async function applyLabels() {
  console.log("🏷️  Applying labels...");

  const labels = [
    // Contribution tiers
    { name: "good first issue",    color: "7057ff", description: "Easy entry point for new contributors" },
    { name: "help wanted",         color: "008672", description: "Open for community contributions" },
    { name: "contributor: needed", color: "e4e669", description: "Actively seeking a contributor" },

    // Type
    { name: "bug",                 color: "d73a4a", description: "Something is broken" },
    { name: "enhancement",         color: "a2eeef", description: "New feature or improvement" },
    { name: "documentation",       color: "0075ca", description: "Docs additions or fixes" },
    { name: "question",            color: "d876e3", description: "Discussion or clarification needed" },
    { name: "refactor",            color: "fbca04", description: "Code quality improvement" },
    { name: "test",                color: "bfd4f2", description: "Test coverage additions" },
    { name: "chore",               color: "ffffff", description: "Maintenance task, no user-visible change" },

    // Status
    { name: "status: in progress", color: "0e8a16", description: "Actively being worked on" },
    { name: "status: blocked",     color: "e11d48", description: "Blocked — needs discussion or dependency" },
    { name: "status: review needed", color: "c2e0c6", description: "PR ready for review" },
    { name: "status: wontfix",     color: "ffffff", description: "Out of scope or intentionally not fixed" },
    { name: "status: duplicate",   color: "cfd3d7", description: "Already reported" },
    { name: "status: invalid",     color: "e4e669", description: "Not a valid issue" },

    // Priority
    { name: "priority: high",      color: "b60205", description: "Urgent" },
    { name: "priority: medium",    color: "e99695", description: "Should be addressed soon" },
    { name: "priority: low",       color: "f9d0c4", description: "Nice to have" },
  ];

  await Promise.all(labels.map((l) => ensureLabel(l.name, l.color, l.description)));
  console.log("");
}

// ─────────────────────────────────────────────
// 3. Community files
// ─────────────────────────────────────────────

async function applyCommunityFiles(defaultBranch) {
  console.log("📄 Writing community files...");

  const vars = { repo, defaultBranch, repoUrl: `https://github.com/${owner}/${repo}` };

  const files = [
    ["CONTRIBUTING.md",                              "CONTRIBUTING.md",                              "docs: add CONTRIBUTING.md"],
    ["CODE_OF_CONDUCT.md",                           "CODE_OF_CONDUCT.md",                           "docs: add CODE_OF_CONDUCT.md"],
    ["SECURITY.md",                                  "SECURITY.md",                                  "docs: add SECURITY.md"],
    [".github/PULL_REQUEST_TEMPLATE.md",             "pr_template/PULL_REQUEST_TEMPLATE.md",         "chore: add PR template"],
    [".github/ISSUE_TEMPLATE/bug_report.md",         "issue_templates/bug_report.md",                "chore: add bug report template"],
    [".github/ISSUE_TEMPLATE/feature_request.md",    "issue_templates/feature_request.md",           "chore: add feature request template"],
    [".github/ISSUE_TEMPLATE/contributor_access.md", "issue_templates/contributor_access.md",        "chore: add contributor access template"],
  ];

  for (const [dest, templateFile, message] of files) {
    await upsertFile(dest, loadTemplate(templateFile, vars), message, defaultBranch);
  }
  console.log("");
}

// ─────────────────────────────────────────────
// 4. Repo settings
// ─────────────────────────────────────────────

async function applyRepoSettings() {
  console.log("⚙️  Applying repo settings...");
  try {
    await octokit.repos.update({
      owner,
      repo,
      has_issues: true,
      has_projects: false,   // flip to true if you use project boards
      has_wiki: false,
      allow_squash_merge: true,
      allow_merge_commit: false,  // squash-only keeps history clean
      allow_rebase_merge: false,
      delete_branch_on_merge: true,
    });
    console.log("  ✓  Repo settings updated\n");
  } catch (e) {
    console.warn(`  !  Repo settings update failed: ${e.message}\n`);
  }
}

// ─────────────────────────────────────────────
// 5. Summary
// ─────────────────────────────────────────────

async function printSummary() {
  console.log("─".repeat(50));
  console.log(`✅ Hardening complete for ${owner}/${repo}`);
  console.log(`\nManual steps to finish up:`);
  console.log(`  1. Review and customise CONTRIBUTING.md with your actual project setup steps`);
  console.log(`  2. Add your email or contact to SECURITY.md`);
  console.log(`  3. Pin a "good first issue" once you have one`);
  console.log(`  4. Add a CODEOWNERS file when you have a stable team`);
  console.log(`  5. Enable GitHub Discussions if you want async Q&A separate from issues`);
  console.log(`\nhttps://github.com/${owner}/${repo}\n`);
}

// ─────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────

(async () => {
  try {
    const defaultBranch = await resolveDefaultBranch();
    console.log(`\n🔧 Hardening ${owner}/${repo} (branch: ${defaultBranch})\n`);
    await applyBranchProtection(defaultBranch);
    await applyLabels();
    await applyCommunityFiles(defaultBranch);
    await applyRepoSettings();
    await printSummary();
  } catch (err) {
    console.error("❌ Hardening failed:", err.message);
    process.exit(1);
  }
})();
