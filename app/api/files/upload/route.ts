import { NextRequest } from 'next/server';
import { promises as fs, existsSync } from 'fs';
import { join, resolve, relative, dirname } from 'path';
import { CONFIG } from '@/lib/config';
import { ValidationError, createErrorResponse } from '@/lib/errors';
import { validateFilePath } from '@/lib/validation';
import { logger } from '@/lib/logger';

const PROJECT_ROOT = process.cwd();
const WORKSPACE_ROOT = resolve(PROJECT_ROOT, CONFIG.FILE_SYSTEM.WORKSPACE_ROOT);

if (!existsSync(WORKSPACE_ROOT)) {
  fs.mkdir(WORKSPACE_ROOT, { recursive: true }).catch((error) => {
    logger.error('Failed to create workspace directory', error);
  });
}

/**
 * Validate file path and prevent path traversal attacks
 */
function validateAndResolvePath(filePath: string): string {
  try {
    const validated = validateFilePath(filePath, WORKSPACE_ROOT);
    return resolve(WORKSPACE_ROOT, validated);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError('Invalid file path', { originalError: String(error) });
  }
}

/**
 * Recursively create directory structure
 */
async function ensureDirectoryExists(dirPath: string): Promise<void> {
  if (!existsSync(dirPath)) {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

/**
 * Recursively delete all files and directories in a directory
 */
async function clearDirectory(dirPath: string): Promise<void> {
  if (!existsSync(dirPath)) {
    return;
  }

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = resolve(dirPath, entry.name);
    
    // Ensure we're not going outside the workspace
    const relativeEntry = relative(WORKSPACE_ROOT, fullPath);
    if (relativeEntry.startsWith('..') || relativeEntry.includes('..')) {
      continue;
    }
    
    if (entry.isDirectory()) {
      await clearDirectory(fullPath);
      await fs.rmdir(fullPath);
    } else {
      await fs.unlink(fullPath);
    }
  }
}

/**
 * Handle file upload
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const targetPath = formData.get('targetPath') as string || './';

    if (!files || files.length === 0) {
      throw new ValidationError('No files provided');
    }

    // Normalize target path
    let normalizedTargetPath = targetPath;
    if (normalizedTargetPath === './workspace' || normalizedTargetPath === 'workspace' || normalizedTargetPath.startsWith('./workspace/')) {
      normalizedTargetPath = normalizedTargetPath.replace(/^\.\/workspace\/?/, './').replace(/^workspace\/?/, './');
    }
    if (normalizedTargetPath === './' || normalizedTargetPath === '' || normalizedTargetPath === 'workspace') {
      normalizedTargetPath = './';
    }

    // Validate and resolve target directory
    let targetDir: string;
    try {
      targetDir = validateAndResolvePath(normalizedTargetPath);
    } catch (error) {
      if (normalizedTargetPath === './' || normalizedTargetPath === '') {
        targetDir = WORKSPACE_ROOT;
      } else {
        throw error;
      }
    }

    // If uploading to root workspace, clear it first to replace old content
    if (normalizedTargetPath === './' || normalizedTargetPath === '' || targetDir === WORKSPACE_ROOT) {
      await clearDirectory(WORKSPACE_ROOT);
      logger.info('Workspace cleared before upload');
    }

    // Ensure target directory exists
    await ensureDirectoryExists(targetDir);

    const uploadedFiles: string[] = [];
    const errors: string[] = [];

    // Process each file
    for (const file of files) {
      try {
        // Get relative path from file's webkitRelativePath if available (for folder uploads)
        let relativeFilePath = file.name;
        
        // If webkitRelativePath exists, extract the relative path
        if ('webkitRelativePath' in file && file.webkitRelativePath) {
          const webkitPath = file.webkitRelativePath as string;
          // Remove the first directory if it's the root folder name
          const pathParts = webkitPath.split('/');
          if (pathParts.length > 1) {
            relativeFilePath = pathParts.slice(1).join('/');
          } else {
            relativeFilePath = pathParts[pathParts.length - 1];
          }
        }

        // Construct full path
        const filePath = normalizedTargetPath === './' 
          ? relativeFilePath 
          : `${normalizedTargetPath}/${relativeFilePath}`.replace(/^\.\//, '');

        const fullPath = validateAndResolvePath(filePath);

        // Check file size
        if (file.size > CONFIG.FILE_SYSTEM.MAX_FILE_SIZE) {
          errors.push(`${file.name}: File too large (max ${CONFIG.FILE_SYSTEM.MAX_FILE_SIZE} bytes)`);
          continue;
        }

        // Ensure parent directory exists
        const parentDir = dirname(fullPath);
        await ensureDirectoryExists(parentDir);

        // Read file content
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Write file
        await fs.writeFile(fullPath, buffer);
        
        uploadedFiles.push(filePath);
        logger.info('File uploaded', { path: filePath, size: file.size });
      } catch (error) {
        const errorMessage = error instanceof ValidationError 
          ? error.message 
          : `Failed to upload ${file.name}: ${String(error)}`;
        errors.push(errorMessage);
        logger.error('Error uploading file', { fileName: file.name, error });
      }
    }

    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        uploaded: uploadedFiles,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    logger.error('Error in POST /api/files/upload', error);
    const errorResponse = createErrorResponse(
      error instanceof ValidationError
        ? error
        : new Error('Failed to upload files'),
      CONFIG.ENV.IS_PRODUCTION
    );
    
    const statusCode = error instanceof ValidationError
      ? error.statusCode
      : 500;

    return new Response(
      JSON.stringify(errorResponse),
      { status: statusCode, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

