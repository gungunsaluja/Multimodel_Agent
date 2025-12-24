import { NextRequest } from 'next/server';
import { resolve } from 'path';
import { CONFIG } from '@/lib/config';
import { ValidationError, createErrorResponse } from '@/lib/errors';
import { validateFilePath } from '@/lib/validation';
import { logger } from '@/lib/logger';
import { clearWorkspace, writeFile as writeFileToBlob } from '@/lib/blobStorage';

const PROJECT_ROOT = process.cwd();
const WORKSPACE_ROOT = resolve(PROJECT_ROOT, CONFIG.FILE_SYSTEM.WORKSPACE_ROOT);

function validateAndResolvePath(filePath: string): string {
  try {
    const validated = validateFilePath(filePath, WORKSPACE_ROOT);
    return validated;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError('Invalid file path', { originalError: String(error) });
  }
}

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

    if (normalizedTargetPath === './' || normalizedTargetPath === '') {
      await clearWorkspace();
      logger.info('Workspace cleared before upload');
    }

    const uploadedFiles: string[] = [];
    const errors: string[] = [];

    for (const file of files) {
      try {
        let relativeFilePath = file.name;
        
        if ('webkitRelativePath' in file && file.webkitRelativePath) {
          const webkitPath = file.webkitRelativePath as string;
          const pathParts = webkitPath.split('/');
          if (pathParts.length > 1) {
            relativeFilePath = pathParts.slice(1).join('/');
          } else {
            relativeFilePath = pathParts[pathParts.length - 1];
          }
        }

        const filePath = normalizedTargetPath === './' 
          ? relativeFilePath 
          : `${normalizedTargetPath}/${relativeFilePath}`.replace(/^\.\//, '');

        validateAndResolvePath(filePath);

        if (file.size > CONFIG.FILE_SYSTEM.MAX_FILE_SIZE) {
          errors.push(`${file.name}: File too large (max ${CONFIG.FILE_SYSTEM.MAX_FILE_SIZE} bytes)`);
          continue;
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const content = buffer.toString('utf-8');

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

