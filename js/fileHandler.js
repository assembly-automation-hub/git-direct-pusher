/**
 * Browser File & Directory Reader Utilities
 */

/**
 * Converts a File object into a Base64-encoded payload.
 */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result || '';
      const base64 = result.includes(',') ? result.split(',')[1] : '';
      resolve(base64);
    };
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/**
 * Converts a UTF-8 plain text string into Base64.
 */
export function textToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Reads all entries from a FileSystemDirectoryReader (handles Chrome's 100-entry batch limit).
 */
async function readAllDirectoryEntries(dirReader) {
  const allEntries = [];
  while (true) {
    const batch = await new Promise((resolve, reject) => {
      dirReader.readEntries(resolve, reject);
    });
    if (!batch || batch.length === 0) break;
    allEntries.push(...batch);
  }
  return allEntries;
}

/**
 * Recursively traverses a dropped FileSystemEntry (files and nested folders).
 */
export async function traverseEntry(entry, stagedFilesMap, currentPath = '') {
  if (!entry) return;

  if (entry.isFile) {
    const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
    const base64 = await fileToBase64(file);
    const fullPath = (currentPath + file.name).replace(/^\/+/, '');
    stagedFilesMap.set(fullPath, { base64, size: file.size });
  } else if (entry.isDirectory) {
    const dirReader = entry.createReader();
    const entries = await readAllDirectoryEntries(dirReader);
    for (const childEntry of entries) {
      await traverseEntry(childEntry, stagedFilesMap, `${currentPath}${entry.name}/`);
    }
  }
}

/**
 * Processes standard FileList from <input type="file"> or <input webkitdirectory>.
 */
export async function processFileList(fileList, stagedFilesMap) {
  for (const file of fileList) {
    const base64 = await fileToBase64(file);
    const relativePath = (file.webkitRelativePath || file.name).replace(/^\/+/, '');
    stagedFilesMap.set(relativePath, { base64, size: file.size });
  }
}
