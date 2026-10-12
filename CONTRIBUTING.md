# OfficeOS — Git Branching & Collaboration Guide

This guide ensures that **Niladri** and **Aritra** can collaborate simultaneously on separate features without branch divergence, push rejections, or merge conflicts.

---

## 1. Branch Architecture

| Branch | Purpose | Protection Rule |
| :--- | :--- | :--- |
| `main` | Production & deployment-ready code. | **Locked**. Never commit or push directly to `main`. |
| `develop` | Active development trunk & staging integration. | Primary base for feature branches. All PRs merge here first. |
| `feature/<name>-<feature>` | Individual feature/bugfix branches. | Work here. Push freely to remote. |

---

## 2. Standard Daily Workflow for Niladri & Aritra

### Step 1: Start from the latest `develop`
Before starting a new feature, ensure your local `develop` branch is completely up to date:
```bash
git checkout develop
git pull origin develop
```

### Step 2: Create your own feature branch
Name your branch with your name or initial and feature description:
```bash
# Example for Niladri:
git checkout -b feature/niladri-payroll-export

# Example for Aritra:
git checkout -b feature/aritra-attendance-kiosk
```

### Step 3: Work, commit, and sync regularly
As you build:
```bash
git add .
git commit -m "feat(module): add initial feature implementation"
```

If the other person merged something into `develop` while you were working, pull the latest changes into your branch to stay up to date:
```bash
git fetch origin develop
git merge origin/develop
```
*(Resolve any small overlaps locally and verify tests)*

### Step 4: Push your feature branch to GitHub
```bash
git push -u origin feature/your-feature-name
```

---

## 3. Merging Work into `develop`

When a feature is finished and tested:
1. Open a **Pull Request (PR)** on GitHub targeting `develop`:
   `feature/<name>-<feature>` ➔ `develop`
2. Run automated tests:
   - Backend: `pytest` & `ruff check`
   - Frontend: `npm run build` / `npx tsc --noEmit`
3. Merge the PR into `develop`.

---

## 4. Releasing to `main`

Only merge `develop` into `main` when a milestone or release is fully verified:
```bash
git checkout main
git pull origin main
git merge develop
git push origin main
```

---

## 5. Golden Rules to Avoid Conflicts

1. **NEVER push directly to `main`**: If someone pushes directly to `main` while others commit to `develop`, both branches diverge.
2. **Commit small, focused changes**: Avoid editing core shared files (like `leave.py` or global router files) unless coordinated.
3. **Always pull `develop` before starting work**: Never base a new branch off an outdated local branch.
