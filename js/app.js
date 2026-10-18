import { parseRepoInput, getRepoMetadata, pushFilesDirectly } from './api.js';
import { traverseEntry, processFileList, textToBase64 } from './fileHandler.js';

const stagedFiles = new Map(); // path -> { base64, size }

// DOM Elements
const tokenInput = document.getElementById('token');
const repoInput = document.getElementById('repo');
const targetBranchInput = document.getElementById('targetBranch');
const commitMessageInput = document.getElementById('commitMessage');
const forcePushCheckbox = document.getElementById('forcePush');
const detectBranchBtn = document.getElementById('detectBranchBtn');
const repoStatus = document.getElementById('repoStatus');

const dropzone = document.getElementById('dropzone');
const selectFilesBtn = document.getElementById('selectFilesBtn');
const selectFolderBtn = document.getElementById('selectFolderBtn');
const fileInput = document.getElementById('fileInput');
const folderInput = document.getElementById('folderInput');

const manualPathInput = document.getElementById('manualPath');
const manualContentInput = document.getElementById('manualContent');
const addManualBtn = document.getElementById('addManualBtn');

const fileListEl = document.getElementById('fileList');
const fileCountEl = document.getElementById('fileCount');
const clearFilesBtn = document.getElementById('clearFilesBtn');

const submitBtn = document.getElementById('submitBtn');
const logContainer = document.getElementById('logContainer');
const logBox = document.getElementById('logBox');
const clearLogBtn = document.getElementById('clearLogBtn');

// Load persisted settings from localStorage
tokenInput.value = localStorage.getItem('gh_direct_token') || '';
repoInput.value = localStorage.getItem('gh_direct_repo') || '';
targetBranchInput.value = localStorage.getItem('gh_direct_branch') || 'main';

tokenInput.addEventListener('change', () => localStorage.setItem('gh_direct_token', tokenInput.value.trim()));
repoInput.addEventListener('change', () => localStorage.setItem('gh_direct_repo', repoInput.value.trim()));
targetBranchInput.addEventListener('change', () => localStorage.setItem('gh_direct_branch', targetBranchInput.value.trim()));

// Logging helper
function log(message, isError = false) {
  logContainer.classList.remove('hidden');
  const line = document.createElement('div');
  line.className = isError ? 'text-red-400 font-semibold' : 'text-slate-300';
  const time = new Date().toLocaleTimeString();
  line.innerHTML = `<span class="text-slate-500">[${time}]</span> ${message}`;
  logBox.appendChild(line);
  logBox.scrollTop = logBox.scrollHeight;
}

clearLogBtn.addEventListener('click', () => {
  logBox.innerHTML = '';
  logContainer.classList.add('hidden');
});

// Format file size
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

// Render staged files list
function renderStagedFiles() {
  fileCountEl.textContent = stagedFiles.size;
  fileListEl.innerHTML = '';

  if (stagedFiles.size === 0) {
    fileListEl.innerHTML = '<li class="text-slate-500 text-xs italic">No files staged yet...</li>';
    return;
  }

  const sortedPaths = Array.from(stagedFiles.keys()).sort();
  for (const path of sortedPaths) {
    const data = stagedFiles.get(path);
    const li = document.createElement('li');
    li.className = 'flex justify-between items-center bg-slate-900 px-3 py-1.5 rounded border border-slate-700/60';

    const span = document.createElement('span');
    span.className = 'truncate text-blue-300';
    span.innerHTML = `${path} <span class="text-slate-500 text-xs ml-1">(${formatBytes(data.size)})</span>`;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'text-slate-400 hover:text-red-400 ml-3 text-xs transition';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      stagedFiles.delete(path);
      renderStagedFiles();
    });

    li.appendChild(span);
    li.appendChild(removeBtn);
    fileListEl.appendChild(li);
  }
}

clearFilesBtn.addEventListener('click', () => {
  stagedFiles.clear();
  renderStagedFiles();
});

// Check repository & auto-fill default branch
detectBranchBtn.addEventListener('click', async () => {
  const token = tokenInput.value.trim();
  const parsed = parseRepoInput(repoInput.value);

  if (!token) return alert('Please enter your GitHub Token first.');
  if (!parsed) return alert('Invalid repository format. Use owner/repo or a full GitHub URL.');

  repoStatus.textContent = 'Checking repository...';
  repoStatus.className = 'text-xs font-mono text-slate-400';

  try {
    const meta = await getRepoMetadata(parsed.owner, parsed.repo, token);
    targetBranchInput.value = meta.default_branch;
    localStorage.setItem('gh_direct_branch', meta.default_branch);
    repoStatus.textContent = `Connected: ${meta.full_name} (default: ${meta.default_branch})`;
    repoStatus.className = 'text-xs font-mono text-emerald-400';
  } catch (err) {
    repoStatus.textContent = err.message;
    repoStatus.className = 'text-xs font-mono text-red-400';
  }
});

// File / Folder Input Triggers
selectFilesBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  fileInput.click();
});

selectFolderBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  folderInput.click();
});

dropzone.addEventListener('click', (e) => {
  if (e.target === dropzone) fileInput.click();
});

fileInput.addEventListener('change', async (e) => {
  await processFileList(e.target.files, stagedFiles);
  fileInput.value = '';
  renderStagedFiles();
});

folderInput.addEventListener('change', async (e) => {
  await processFileList(e.target.files, stagedFiles);
  folderInput.value = '';
  renderStagedFiles();
});

// Drag & Drop Handlers
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dropzone-active');
});

dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('dropzone-active');
});

dropzone.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropzone.classList.remove('dropzone-active');

  const items = e.dataTransfer.items;
  if (!items) return;

  const entries = [];
  for (let i = 0; i < items.length; i++) {
    const entry = items[i].webkitGetAsEntry ? items[i].webkitGetAsEntry() : null;
    if (entry) entries.push(entry);
  }

  for (const entry of entries) {
    await traverseEntry(entry, stagedFiles);
  }
  renderStagedFiles();
});

// Manual File Staging
addManualBtn.addEventListener('click', () => {
  const path = manualPathInput.value.trim().replace(/^\/+/, '');
  const content = manualContentInput.value;

  if (!path) {
    alert('Please specify a relative file path (e.g. .github/workflows/main.yml).');
    return;
  }

  const base64 = textToBase64(content);
  const byteSize = new TextEncoder().encode(content).byteLength;
  stagedFiles.set(path, { base64, size: byteSize });

  manualPathInput.value = '';
  manualContentInput.value = '';
  renderStagedFiles();
});

// Direct Push Execution
submitBtn.addEventListener('click', async () => {
  const token = tokenInput.value.trim();
  const parsed = parseRepoInput(repoInput.value);
  const branch = targetBranchInput.value.trim() || 'main';
  const commitMessage = commitMessageInput.value.trim() || 'Direct push via GitHub Web Pusher';
  const force = forcePushCheckbox.checked;

  if (!token) return alert('Please enter your GitHub Token.');
  if (!parsed) return alert('Invalid repository format. Use owner/repo or a full GitHub URL.');
  if (stagedFiles.size === 0) return alert('Please stage at least one file before pushing.');

  submitBtn.disabled = true;
  submitBtn.classList.add('opacity-50', 'cursor-not-allowed');

  try {
    log(`Starting direct push to <b>${parsed.owner}/${parsed.repo}</b> (branch: <b>${branch}</b>)...`);

    const result = await pushFilesDirectly({
      owner: parsed.owner,
      repo: parsed.repo,
      branch,
      commitMessage,
      filesMap: stagedFiles,
      token,
      force,
      onProgress: (msg) => log(msg)
    });

    log(
      `Push complete! Commit <a href="${result.commitUrl}" target="_blank" class="text-emerald-400 underline font-bold">${result.commitSha.slice(0, 7)}</a> is live on branch <a href="${result.branchUrl}" target="_blank" class="text-blue-400 underline font-bold">${branch}</a>.`
    );
  } catch (err) {
    log(err.message, true);
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
  }
});
