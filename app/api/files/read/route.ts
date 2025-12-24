import { NextRequest } from 'next/server';
import { CONFIG } from '@/lib/config';
import { ValidationError, NotFoundError, createErrorResponse } from '@/lib/errors';
import { validateFilePath } from '@/lib/validation';
import { logger } from '@/lib/logger';
import { readFile as readFileFromBlob, fileExists } from '@/lib/blobStorage';
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

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const path = searchParams.get('path');

    if (!path) {
      throw new ValidationError('Path is required');
    }

    // Validate path
    validateAndResolvePath(path);

    // Check if file exists
    const exists = await fileExists(path);
    if (!exists) {
      throw new NotFoundError('File');
    }

    // Read file content from blob storage
    const content = await readFileFromBlob(path);

    if (!content) {
      throw new NotFoundError('File');
    }

    // Check file size
    if (content.length > CONFIG.FILE_SYSTEM.MAX_FILE_SIZE) {
      throw new ValidationError(
        `File too large. Maximum size is ${CONFIG.FILE_SYSTEM.MAX_FILE_SIZE} bytes`,
        { size: content.length, maxSize: CONFIG.FILE_SYSTEM.MAX_FILE_SIZE }
      );
    }

    logger.info('File read', { path, size: content.length });

    return new Response(
      JSON.stringify({ success: true, content }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    logger.error('Error in GET /api/files/read', error);
    const errorResponse = createErrorResponse(
      error instanceof ValidationError || error instanceof NotFoundError
        ? error
        : new Error('Failed to read file'),
      CONFIG.ENV.IS_PRODUCTION
    );
    
    const statusCode = error instanceof ValidationError || error instanceof NotFoundError
      ? error.statusCode
      : 500;

    return new Response(
      JSON.stringify(errorResponse),
      { status: statusCode, headers: { 'Content-Type': 'application/json' } }
    );
  }
}


