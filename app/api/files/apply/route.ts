import { NextRequest } from 'next/server';
import { CONFIG } from '@/lib/config';
import { ValidationError, createErrorResponse } from '@/lib/errors';
import { validateFilePath, sanitizeFileContent } from '@/lib/validation';
import { logger } from '@/lib/logger';
import { writeFile as writeFileToBlob, deleteFile as deleteFileFromBlob, fileExists } from '@/lib/blobStorage';
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
 * Apply file changes (Keep button)
 */
export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ValidationError('Invalid JSON in request body');
    }

    if (!body || typeof body !== 'object') {
      throw new ValidationError('Request body must be an object');
    }

    const requestBody = body as Record<string, unknown>;
    const filePathRaw = requestBody.filePath;
    const content = requestBody.content;

    if (!filePathRaw || typeof filePathRaw !== 'string') {
      throw new ValidationError('File path is required and must be a string');
    }

    let filePath: string = filePathRaw;

    // Normalize file path - remove ./workspace/ prefix if present
    if (filePath.startsWith('./workspace/')) {
      filePath = filePath.replace('./workspace/', '');
    } else if (filePath.startsWith('workspace/')) {
      filePath = filePath.replace('workspace/', '');
    } else if (filePath.startsWith('./')) {
      filePath = filePath.replace('./', '');
    }

    // Validate path
    validateAndResolvePath(filePath);
    
    logger.info('Applying file changes', { 
      originalPath: requestBody.filePath, 
      normalizedPath: filePath,
      contentLength: content ? String(content).length : 0 
    });

    // Sanitize and validate content
    const sanitizedContent = content 
      ? sanitizeFileContent(String(content))
      : '';

    // Write the file to blob storage
    await writeFileToBlob(filePath, sanitizedContent);

    logger.info('File changes applied', { filePath, size: sanitizedContent.length });

    return new Response(
      JSON.stringify({ success: true, message: 'File changes applied' }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    logger.error('Error in POST /api/files/apply', error);
    const errorResponse = createErrorResponse(
      error instanceof ValidationError
        ? error
        : new Error('Failed to apply file changes'),
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
 * Reject file changes (Undo button) - restore old content
 */
export async function PUT(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ValidationError('Invalid JSON in request body');
    }

    if (!body || typeof body !== 'object') {
      throw new ValidationError('Request body must be an object');
    }

    const requestBody = body as Record<string, unknown>;
    const filePath = requestBody.filePath;
    const oldContent = requestBody.oldContent;

    if (!filePath || typeof filePath !== 'string') {
      throw new ValidationError('File path is required and must be a string');
    }

    // Validate path
    validateAndResolvePath(filePath);

    // If oldContent is empty and file exists, delete it
    if (!oldContent || (typeof oldContent === 'string' && oldContent.trim() === '')) {
      const exists = await fileExists(filePath);
      if (exists) {
        await deleteFileFromBlob(filePath);
        logger.info('File deleted', { filePath });
      }
      return new Response(
        JSON.stringify({ success: true, message: 'File deleted' }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Sanitize and validate old content
    const sanitizedContent = oldContent 
      ? sanitizeFileContent(String(oldContent))
      : '';

    // Restore old content to blob storage
    await writeFileToBlob(filePath, sanitizedContent);

    logger.info('File changes reverted', { filePath, size: sanitizedContent.length });

    return new Response(
      JSON.stringify({ success: true, message: 'File changes reverted' }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    logger.error('Error in PUT /api/files/apply', error);
    const errorResponse = createErrorResponse(
      error instanceof ValidationError
        ? error
        : new Error('Failed to revert file changes'),
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


