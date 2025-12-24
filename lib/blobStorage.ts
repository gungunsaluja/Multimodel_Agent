import { put, del, list, head } from '@vercel/blob';
import { CONFIG } from './config';
import { logger } from './logger';
import { ValidationError } from './errors';

const WORKSPACE_PREFIX = 'workspace/';

/**
 * Get blob token from environment
 */
function getBlobToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    logger.error('BLOB_READ_WRITE_TOKEN is missing in environment variables');
    throw new Error('BLOB_READ_WRITE_TOKEN environment variable is not set. Please add it in Vercel Dashboard → Settings → Environment Variables');
  }
  return token;
}

/**
 * Normalize file path for blob storage
 * Removes leading ./ or workspace/ and ensures consistent format
 */
function normalizeBlobPath(filePath: string): string {
  let normalized = filePath
    .replace(/^\.\//, '')
    .replace(/^workspace\//, '')
    .replace(/\/+/g, '/'); // Remove duplicate slashes
  
  return `${WORKSPACE_PREFIX}${normalized}`;
}

/**
 * Read file content from blob storage
 */
export async function readFile(filePath: string): Promise<string | null> {
  try {
    const blobPath = normalizeBlobPath(filePath);
    logger.info('Reading file from blob', { filePath, blobPath });
    
    const blob = await head(blobPath, {
      token: getBlobToken(),
    });
    
    if (!blob.url) {
      logger.warn('No URL in blob response', { filePath, blobPath });
      return null;
    }
    
    const response = await fetch(blob.url, {
      cache: 'no-store',
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        logger.warn('Blob not found (404)', { filePath, blobPath });
        return null;
      }
      throw new Error(`Failed to fetch blob: ${response.statusText}`);
    }
    
    const content = await response.text();
    
    if (content.length > CONFIG.FILE_SYSTEM.MAX_FILE_SIZE) {
      logger.warn('File too large to read', { filePath, size: content.length });
      return null;
    }
    
    logger.info('File read successfully from blob', { filePath, size: content.length });
    return content;
  } catch (error: any) {
    if (error?.status === 404 || error?.message?.includes('not found') || error?.message?.includes('Could not find blob')) {
      logger.warn('Blob not found', { filePath, error: error?.message });
      return null;
    }
    logger.warn('Error reading file from blob', { filePath, error });
    return null;
  }
}

/**
 * Write file content to blob storage
 */
export async function writeFile(
  filePath: string, 
  content: string
): Promise<{ success: boolean; message: string }> {
  try {
    const blobPath = normalizeBlobPath(filePath);
    const sanitizedContent = content;
    
    logger.info('Writing file to blob', { filePath, blobPath, size: sanitizedContent.length });
    
    try {
      await del(blobPath, {
        token: getBlobToken(),
      });
      logger.info('Deleted existing blob', { blobPath });
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (deleteError: any) {
      if (deleteError?.status !== 404 && !deleteError?.message?.includes('not found')) {
        logger.warn('Error deleting existing blob', { blobPath, error: deleteError?.message });
      }
    }
    
    await put(blobPath, sanitizedContent, {
      token: getBlobToken(),
      contentType: 'text/plain',
      addRandomSuffix: false,
      access: 'public',
    });
    
    logger.info('File written to blob successfully', { filePath, blobPath, size: sanitizedContent.length });
    
    return { success: true, message: 'File written successfully' };
  } catch (error) {
    logger.error('Error writing file to blob', { filePath, error });
    throw new Error(`Failed to write file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Delete file from blob storage
 */
export async function deleteFile(filePath: string): Promise<void> {
  try {
    const blobPath = normalizeBlobPath(filePath);
    await del(blobPath, {
      token: getBlobToken(),
    });
    logger.info('File deleted from blob', { filePath });
  } catch (error) {
    logger.error('Error deleting file from blob', { filePath, error });
    throw error;
  }
}

/**
 * Check if file exists in blob storage
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const blobPath = normalizeBlobPath(filePath);
    await head(blobPath, {
      token: getBlobToken(),
    });
    return true;
  } catch (error: any) {
    if (error?.status === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * List all files in workspace (recursive)
 */
export async function listFiles(prefix: string = WORKSPACE_PREFIX): Promise<Array<{ name: string; path: string }>> {
  try {
    const { blobs } = await list({
      token: getBlobToken(),
      prefix: prefix,
    });
    
    const files: Array<{ name: string; path: string }> = [];
    
    for (const blob of blobs) {
      // Remove workspace prefix to get relative path
      const relativePath = blob.pathname.replace(WORKSPACE_PREFIX, '');
      
      // Skip if it's just the workspace prefix itself
      if (!relativePath || relativePath === '') {
        continue;
      }
      
      const name = relativePath.split('/').pop() || relativePath;
      
      files.push({
        name,
        path: relativePath,
      });
    }
    
    return files;
  } catch (error) {
    logger.error('Error listing files from blob', { prefix, error });
    return [];
  }
}

/**
 * List files in a specific directory (non-recursive)
 * Returns files and directories
 */
export async function listDirectory(dirPath: string = ''): Promise<{
  files: Array<{ name: string; path: string; type: 'file' | 'directory' }>;
}> {
  try {
    // Normalize directory path
    let normalizedDir = dirPath
      .replace(/^\.\//, '')
      .replace(/^workspace\//, '')
      .replace(/\/$/, ''); // Remove trailing slash
    
    const prefix = normalizedDir 
      ? `${WORKSPACE_PREFIX}${normalizedDir}/`
      : `${WORKSPACE_PREFIX}`;
    
    const { blobs } = await list({
      token: getBlobToken(),
      prefix: prefix,
    });
    
    const files: Array<{ name: string; path: string; type: 'file' | 'directory' }> = [];
    const seenPaths = new Set<string>();
    
    for (const blob of blobs) {
      // Remove workspace prefix and the directory prefix
      let relativePath = blob.pathname.replace(WORKSPACE_PREFIX, '');
      
      if (normalizedDir) {
        relativePath = relativePath.replace(`${normalizedDir}/`, '');
      }
      
      // Get immediate children only (not nested)
      const parts = relativePath.split('/');
      if (parts.length === 0) continue;
      
      const immediateName = parts[0];
      const fullPath = normalizedDir 
        ? `${normalizedDir}/${immediateName}`
        : immediateName;
      
      // Skip if we've already seen this path
      if (seenPaths.has(fullPath)) continue;
      seenPaths.add(fullPath);
      
      // Determine if it's a directory (has more parts) or file
      const isDirectory = parts.length > 1;
      
      files.push({
        name: immediateName,
        path: fullPath,
        type: isDirectory ? 'directory' : 'file',
      });
    }
    
    // Sort: directories first, then files, both alphabetically
    files.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    
    return { files };
  } catch (error) {
    logger.error('Error listing directory from blob', { dirPath, error });
    return { files: [] };
  }
}

/**
 * Delete all files in workspace (clear workspace)
 */
export async function clearWorkspace(): Promise<void> {
  try {
    const { blobs } = await list({
      token: getBlobToken(),
      prefix: WORKSPACE_PREFIX,
    });
    
    // Delete all blobs
    await Promise.all(
      blobs.map(blob => 
        del(blob.pathname, {
          token: getBlobToken(),
        })
      )
    );
    
    logger.info('Workspace cleared', { count: blobs.length });
  } catch (error) {
    logger.error('Error clearing workspace', { error });
    throw error;
  }
}
