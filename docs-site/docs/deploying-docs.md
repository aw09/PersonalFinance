---
sidebar_position: 10
---

# Maintaining This Guide

These docs live inside the main `PersonalFinance` repository under `docs-site/`.  
Here’s how to preview, build, and publish them to GitHub Pages.

## Local development

```bash
cd docs-site
npm install   # already done once by create-docusaurus
npm run start
```

- The site runs at `http://localhost:3000`.
- Markdown changes hot-reload instantly.

## Build for production

```bash
npm run build
```

The static assets land in `docs-site/build/`.

## Deploy to GitHub Pages

1. Set the values in `docusaurus.config.ts`:
   - `url`: `https://YOUR_GITHUB_USERNAME.github.io`
   - `baseUrl`: `/PersonalFinance/` (or your repo name)
   - `organizationName`: `YOUR_GITHUB_USERNAME`
   - `projectName`: `PersonalFinance`
2. Run:

   ```bash
   GIT_USER=YOUR_GITHUB_USERNAME npm run deploy
   ```

   This builds the site and pushes the artifacts to the `gh-pages` branch.

3. Enable GitHub Pages for the repo and point it to the `gh-pages` branch (root).

## Continuous deployment

Add a GitHub Actions workflow similar to:

```yaml
name: Deploy Docs
on:
  push:
    branches: [development]
    paths:
      - 'docs-site/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
        working-directory: docs-site
      - run: npm run build
        working-directory: docs-site
      - run: npx docusaurus deploy
        working-directory: docs-site
        env:
          GIT_USER: ${{ secrets.GH_USERNAME }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Replace secrets with your own. Once configured, every merged change in `docs-site/` will refresh the public help center automatically.
