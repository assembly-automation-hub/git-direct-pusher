/**
 * GitHub REST & Git Data API Wrapper
 */

const GITHUB_API_BASE = 'https://api.github.com';

/**
 * Parses repository owner and name from "owner/repo" string or full GitHub URL.
 */
export function parseRepoInput(input) {
  if (!input) return null;
  const cleaned = input.trim().replace(/\.git$/, '').replace(/\/+$/, '');
  const match = cleaned.match(/(?:github\.com\/)?([^\/]+)\/([^\/]+)$/);
  return match ? { owner: match[1], repo: match[2] } : null;
}

/**
 * Helper to execute authenticated requests against GitHub REST API.
 */
export async function ghRequest(endpoint, token, options = {}) {
  const response = await fetch(`${GITHUB_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`GitHub API Error (${response.status}): ${data.message || response.statusText}`);
  }
  return data;
}

/**
 * Fetches repository metadata (including default_branch).
 */
export async function getRepoMetadata(owner, repo, token) {
  return ghRequest(`/repos/${owner}/${repo}`, token);
}

/**
 * Pushes multiple files directly to a target branch in a single commit.
 * If the target branch does not exist yet, it creates it from the repo's default branch.
 */
export async function pushFilesDirectly({
  owner,
  repo,
  branch,
  commitMessage,
  filesMap,
  token,
  force = false,
  onProgress = () => {}
}) {
  // 1. Check if the target branch exists
  let baseSha = null;
  let baseTreeSha = null;
  let branchExists = true;

  onProgress(`Checking branch <b>${branch}</b> in <b>${owner}/${repo}</b>...`);
  try {
    const refData = await ghRequest(`/repos/${owner}/${repo}/git/ref/heads/${branch}`, token);
    baseSha = refData.object.sha;
  } catch (err) {
    if (err.message.includes('404')) {
      branchExists = false;
      onProgress(`Branch <b>${branch}</b> not found. Checking repository default branch...`);
      const repoMeta = await getRepoMetadata(owner, repo, token);
      const defaultBranch = repoMeta.default_branch;
      const defaultRef = await ghRequest(`/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`, token);
      baseSha = defaultRef.object.sha;
      onProgress(`Using default branch <b>${defaultBranch}</b> (${baseSha.slice(0, 7)}) as base.`);
    } else {
      throw err;
    }
  }

  // 2. Fetch base commit to retrieve its tree SHA
  onProgress(`Fetching base commit tree (${baseSha.slice(0, 7)})...`);
  const baseCommit = await ghRequest(`/repos/${owner}/${repo}/git/commits/${baseSha}`, token);
  baseTreeSha = baseCommit.tree.sha;

  // 3. Create Git Blobs for each staged file
  const treeItems = [];
  let index = 0;
  const total = filesMap.size;

  for (const [filePath, fileData] of filesMap.entries()) {
    index++;
    onProgress(`[${index}/${total}] Uploading blob: <span class="text-blue-300">${filePath}</span> (${fileData.size} B)...`);
    const blob = await ghRequest(`/repos/${owner}/${repo}/git/blobs`, token, {
      method: 'POST',
      body: JSON.stringify({
        content: fileData.base64,
        encoding: 'base64'
      })
    });

    treeItems.push({
      path: filePath,
      mode: '100644',
      type: 'blob',
      sha: blob.sha
    });
  }

  // 4. Create a new Git Tree
  onProgress(`Creating new Git tree with ${treeItems.length} file(s)...`);
  const newTree = await ghRequest(`/repos/${owner}/${repo}/git/trees`, token, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: treeItems
    })
  });

  // 5. Create a Commit referencing the new Tree and parent Commit
  onProgress(`Creating commit...`);
  const newCommit = await ghRequest(`/repos/${owner}/${repo}/git/commits`, token, {
    method: 'POST',
    body: JSON.stringify({
      message: commitMessage,
      tree: newTree.sha,
      parents: [baseSha]
    })
  });

  // 6. Update or Create the Branch Reference to point to the new Commit
  if (branchExists) {
    onProgress(`Updating branch <b>refs/heads/${branch}</b> to commit ${newCommit.sha.slice(0, 7)}...`);
    await ghRequest(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, token, {
      method: 'PATCH',
      body: JSON.stringify({
        sha: newCommit.sha,
        force: force
      })
    });
  } else {
    onProgress(`Creating new branch <b>refs/heads/${branch}</b> at commit ${newCommit.sha.slice(0, 7)}...`);
    await ghRequest(`/repos/${owner}/${repo}/git/refs`, token, {
      method: 'POST',
      body: JSON.stringify({
        ref: `refs/heads/${branch}`,
        sha: newCommit.sha
      })
    });
  }

  const commitUrl = `https://github.com/${owner}/${repo}/commit/${newCommit.sha}`;
  return {
    commitSha: newCommit.sha,
    commitUrl,
    branchUrl: `https://github.com/${owner}/${repo}/tree/${branch}`
  };
}
