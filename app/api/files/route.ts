import { NextRequest } from 'next/server';
import { CONFIG } from '@/lib/config';
import { ValidationError, createErrorResponse } from '@/lib/errors';
import { validateFilePath } from '@/lib/validation';
import { logger } from '@/lib/logger';
import { listDirectory, writeFile as writeFileToBlob, clearWorkspace } from '@/lib/blobStorage';
import { resolve } from 'path';

const PROJECT_ROOT = process.cwd();
const WORKSPACE_ROOT = resolve(PROJECT_ROOT, CONFIG.FILE_SYSTEM.WORKSPACE_ROOT);

/**
 * Validate file path and prevent path traversal attacks
 */
function validateAndResolvePath(filePath: string): string {
  try {
    const validated = validateFilePath(filePath, WORKSPACE_ROOT);
    return validated; // Return validated path, not full path
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError('Invalid file path', { originalError: String(error) });
  }
}

/**
 * List files in directory
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    let pathParam = searchParams.get('path') || './';

    if (pathParam === './workspace' || pathParam === 'workspace' || pathParam.startsWith('./workspace/')) {
      pathParam = pathParam.replace(/^\.\/workspace\/?/, './').replace(/^workspace\/?/, './');
    }

    if (pathParam === './' || pathParam === '' || pathParam === 'workspace') {
      pathParam = './';
    }

    if (pathParam !== './') {
      try {
        validateAndResolvePath(pathParam);
      } catch (error) {
        if (pathParam === './' || pathParam === '') {
          pathParam = './';
        } else {
          throw error;
        }
      }
    }

    const normalizedPath = pathParam === './' ? '' : pathParam.replace(/^\.\//, '');
    const { files } = await listDirectory(normalizedPath);

    return new Response(
      JSON.stringify({ success: true, files }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    logger.error('Error in GET /api/files', error);
    const errorResponse = createErrorResponse(
      error instanceof ValidationError
        ? error
        : new Error('Failed to list files'),
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

    // Validate target path
    if (normalizedTargetPath !== './') {
      try {
        validateAndResolvePath(normalizedTargetPath);
      } catch (error) {
        if (normalizedTargetPath === './' || normalizedTargetPath === '') {
          normalizedTargetPath = './';
        } else {
          throw error;
        }
      }
    }

    // If uploading to root workspace, clear it first
    if (normalizedTargetPath === './' || normalizedTargetPath === '') {
      await clearWorkspace();
      logger.info('Workspace cleared before upload');
    }

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

        // Construct file path
        const filePath = normalizedTargetPath === './' 
          ? relativeFilePath 
          : `${normalizedTargetPath}/${relativeFilePath}`.replace(/^\.\//, '');

        // Validate path
        validateAndResolvePath(filePath);

        // Check file size
        if (file.size > CONFIG.FILE_SYSTEM.MAX_FILE_SIZE) {
          errors.push(`${file.name}: File too large (max ${CONFIG.FILE_SYSTEM.MAX_FILE_SIZE} bytes)`);
          continue;
        }

        // Read file content
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const content = buffer.toString('utf-8');

        // Write to blob storage
        await writeFileToBlob(filePath, content);
        
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

/**
 * Clear workspace
 */
export async function DELETE(request: NextRequest) {
  try {
    await clearWorkspace();
    logger.info('Workspace cleared');

    return new Response(
      JSON.stringify({ success: true, message: 'Workspace cleared successfully' }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    logger.error('Error in DELETE /api/files', error);
    const errorResponse = createErrorResponse(
      error instanceof ValidationError
        ? error
        : new Error('Failed to clear workspace'),
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
