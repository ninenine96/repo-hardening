// harden.js — applies branch protection, labels, and community files to a target repo
// Requires: GH_TOKEN (PAT with repo scope), TARGET_REPO (owner/repo)

const { Octokit } = require("@octokit/rest");

const octokit = new Octokit({ auth: process.env.GH_TOKEN });

const [owner, repo] = (process.env.TARGET_REPO || "").split("/");
const defaultBranch = process.env.DEFAULT_BRANCH || "main";
const projectDescription = process.env.PROJECT_DESCRIPTION || "";

if (!owner || !repo) {
  console.error("❌ TARGET_REPO must be set as owner/repo");
  process.exit(1);
}

console.log(`\n🔧 Hardening ${owner}/${repo} (branch: ${defaultBranch})\n`);

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

async function upsertFile(filePath, content, commitMessage) {
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
    await octokit.issues.getLabel({ owner, repo, name });
    await octokit.issues.updateLabel({ owner, repo, name, color, description });
    console.log(`  ↺  Label: ${name}`);
  } catch (e) {
    if (e.status !== 404) {
      console.warn(`  !  Could not upsert label "${name}": ${e.message}`);
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

async function applyBranchProtection() {
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

async function applyCommunityFiles() {
  console.log("📄 Writing community files...");

  const repoUrl = `https://github.com/${owner}/${repo}`;
  const desc = projectDescription || `${repo} — an open-source project`;

  // CONTRIBUTING.md
  const contributing = `# Contributing to ${repo}

Thanks for your interest in contributing! This document explains how to get involved.

## Ways to contribute

- **Report bugs** — open an issue with the \`bug\` label
- **Request features** — open an issue with the \`enhancement\` label
- **Fix issues** — look for \`good first issue\` or \`help wanted\` labels
- **Improve docs** — typos, clarity, examples, anything helps
- **Review PRs** — feedback from fresh eyes is always valuable

## Getting started

1. **Fork** the repository
2. **Clone** your fork: \`git clone https://github.com/YOUR_USERNAME/${repo}.git\`
3. **Create a branch**: \`git checkout -b feat/your-feature-name\`
4. Make your changes
5. **Push** to your fork and **open a Pull Request** against \`${defaultBranch}\`

## Branch naming

| Type | Pattern |
|------|---------|
| Feature | \`feat/short-description\` |
| Bug fix | \`fix/short-description\` |
| Docs | \`docs/short-description\` |
| Chore | \`chore/short-description\` |

## Pull request checklist

- [ ] Branch is up to date with \`${defaultBranch}\`
- [ ] Description explains *what* and *why*, not just *what*
- [ ] Tests added or updated if applicable
- [ ] No unrelated changes included

## Asking for the contributor role

If you're a member of the Discord and want triage or write access, open an issue titled **"Contributor access request"** and briefly describe what you'd like to work on. We'll add you after your first merged PR.

## Commit style

We use [Conventional Commits](https://www.conventionalcommits.org/):

\`\`\`
feat: add dark mode support
fix: handle null pointer in parser
docs: fix typo in README
chore: bump dependencies
\`\`\`

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Be kind.

---

Questions? Drop into the Discord or open a discussion.
`;

  // CODE_OF_CONDUCT.md (Contributor Covenant 2.1 summary)
  const coc = `# Contributor Covenant Code of Conduct

## Our Pledge

We as members, contributors, and maintainers pledge to make participation in this project a harassment-free experience for everyone, regardless of age, body size, disability, ethnicity, gender identity, level of experience, nationality, personal appearance, race, religion, or sexual identity.

## Our Standards

**Positive behaviour includes:**
- Using welcoming and inclusive language
- Being respectful of differing viewpoints
- Gracefully accepting constructive criticism
- Focusing on what is best for the community

**Unacceptable behaviour includes:**
- Harassment, trolling, or personal attacks
- Publishing others' private information without consent
- Any conduct that could reasonably be considered inappropriate

## Enforcement

Instances of unacceptable behaviour may be reported by opening an issue or contacting a maintainer directly. All complaints will be reviewed and investigated.

This Code of Conduct is adapted from the [Contributor Covenant v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).
`;

  // SECURITY.md
  const security = `# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Report security issues privately by emailing a maintainer (see profile) or via [GitHub's private vulnerability reporting](${repoUrl}/security/advisories/new).

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact

We aim to acknowledge reports within 48 hours and provide a timeline within 7 days.
`;

  // PR template
  const prTemplate = `## What does this PR do?

<!-- Briefly describe the change and why -->

## Related issue

Closes #

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Documentation
- [ ] Refactor / chore

## Checklist

- [ ] I've read [CONTRIBUTING.md](../CONTRIBUTING.md)
- [ ] My branch is up to date with \`${defaultBranch}\`
- [ ] I've added or updated tests where applicable
- [ ] My commits follow the conventional commit style

## Screenshots / context

<!-- If applicable -->
`;

  // Issue templates
  const bugTemplate = `---
name: 🐛 Bug report
about: Something is broken
labels: bug
---

**Describe the bug**
<!-- A clear description of what is wrong -->

**To reproduce**
1. 
2. 
3. 

**Expected behaviour**
<!-- What should have happened -->

**Actual behaviour**
<!-- What actually happened -->

**Environment**
- OS:
- Version / commit:

**Additional context**
<!-- Logs, screenshots, etc. -->
`;

  const featureTemplate = `---
name: ✨ Feature request
about: Propose a new feature or improvement
labels: enhancement
---

**Problem to solve**
<!-- What problem does this feature address? -->

**Proposed solution**
<!-- How would you solve it? -->

**Alternatives considered**
<!-- Any other approaches you thought about? -->

**Additional context**
<!-- Mockups, references, related issues -->
`;

  const contributorTemplate = `---
name: 🤝 Contributor access request
about: Request triage or write access
labels: question
---

**Discord username**
<!-- Your Discord handle so we can match you -->

**What would you like to work on?**
<!-- Briefly describe what you're interested in contributing -->

**Have you made any contributions yet?**
- [ ] Yes — linked PR/issue: 
- [ ] No, this is my first step

**Anything else?**
`;

  const files = [
    ["CONTRIBUTING.md",                            contributing,     "docs: add CONTRIBUTING.md"],
    ["CODE_OF_CONDUCT.md",                         coc,              "docs: add CODE_OF_CONDUCT.md"],
    ["SECURITY.md",                                security,         "docs: add SECURITY.md"],
    [".github/PULL_REQUEST_TEMPLATE.md",           prTemplate,       "chore: add PR template"],
    [".github/ISSUE_TEMPLATE/bug_report.md",       bugTemplate,      "chore: add bug report template"],
    [".github/ISSUE_TEMPLATE/feature_request.md",  featureTemplate,  "chore: add feature request template"],
    [".github/ISSUE_TEMPLATE/contributor_access.md", contributorTemplate, "chore: add contributor access template"],
  ];

  for (const [filePath, content, message] of files) {
    await upsertFile(filePath, content, message);
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
    await applyBranchProtection();
    await applyLabels();
    await applyCommunityFiles();
    await applyRepoSettings();
    await printSummary();
  } catch (err) {
    console.error("❌ Hardening failed:", err.message);
    process.exit(1);
  }
})();
