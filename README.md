# GitHub Direct Pusher

A client-side Single Page Application (SPA) designed for **GitHub Pages** that allows you to upload multiple files and nested folders (such as `.github/workflows/`) and push them **directly to a target branch** (e.g., `main`) in a single commit using the GitHub Git Database API.

## Project Structure

```text
github-direct-pusher/
├── index.html          # Main application UI
├── css/
│   └── styles.css      # Custom scrollbars and dropzone indicators
├── js/
│   ├── app.js          # UI state, localStorage persistence, event listeners
│   ├── api.js          # GitHub REST & Git Data API client (blobs, trees, commits, refs)
│   └── fileHandler.js  # Recursive directory & file reader (Base64 conversion)
└── README.md           # Documentation
```

## Required Token Permissions

Because this tool runs 100% in your browser, your token is stored only in your browser's `localStorage` and is sent directly to `https://api.github.com`.

- **Personal Access Token (Classic):**
  - `repo` (Full control of private and public repositories)
  - `workflow` (Required if pushing files inside `.github/workflows/`)
- **Fine-Grained Personal Access Token:**
  - **Contents:** Read and Write
  - **Workflows:** Read and Write

## How It Works (Under the Hood)

1. Resolves the latest commit SHA on your target branch (`GET /repos/{owner}/{repo}/git/ref/heads/{branch}`). If the branch does not exist yet, it automatically branches off the repository's default branch.
2. Uploads every staged file as a Base64-encoded Git Blob (`POST /repos/{owner}/{repo}/git/blobs`).
3. Constructs a new Git Tree (`POST /repos/{owner}/{repo}/git/trees`) referencing `base_tree` so existing repository files remain intact.
4. Creates a single Git Commit (`POST /repos/{owner}/{repo}/git/commits`).
5. Updates the target branch pointer (`PATCH /repos/{owner}/{repo}/git/refs/heads/{branch}`) to point directly to the new commit.

## Deployment to GitHub Pages

1. Create a new repository on GitHub and push these files to the `main` branch.
2. Go to **Settings -> Pages**.
3. Under **Build and deployment**, select **Deploy from a branch** and choose `main` / `/ (root)`.
4. Open your published GitHub Pages URL.
