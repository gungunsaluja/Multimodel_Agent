import { NextRequest } from 'next/server';
import { promises as fs, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { CONFIG } from '@/lib/config';
import { ValidationError, createErrorResponse } from '@/lib/errors';
import { validateFilePath, sanitizeFileContent } from '@/lib/validation';
import { logger } from '@/lib/logger';

const PROJECT_ROOT = process.cwd();
const WORKSPACE_ROOT = resolve(PROJECT_ROOT, CONFIG.FILE_SYSTEM.WORKSPACE_ROOT);

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

    // Normalize file path - remove ./workspace/ prefix if present
    let filePath: string = filePathRaw;
    if (filePath.startsWith('./workspace/')) {
      filePath = filePath.replace('./workspace/', '');
    } else if (filePath.startsWith('workspace/')) {
      filePath = filePath.replace('workspace/', '');
    } else if (filePath.startsWith('./')) {
      filePath = filePath.replace('./', '');
    }

    // Validate and resolve path
    const fullPath = validateAndResolvePath(filePath);
    
    logger.info('Applying file changes', { 
      originalPath: requestBody.filePath, 
      normalizedPath: filePath, 
      fullPath,
      contentLength: content ? String(content).length : 0 
    });

    // Ensure parent directory exists
    const parentDir = dirname(fullPath);
    await fs.mkdir(parentDir, { recursive: true });

    // Sanitize and validate content
    const sanitizedContent = content 
      ? sanitizeFileContent(String(content))
      : '';

    // Write the file
    await fs.writeFile(fullPath, sanitizedContent, 'utf-8');

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
    const filePathRaw = requestBody.filePath;
    const oldContent = requestBody.oldContent;

    if (!filePathRaw || typeof filePathRaw !== 'string') {
      throw new ValidationError('File path is required and must be a string');
    }

    const filePath: string = filePathRaw;

    // Validate and resolve path
    const fullPath = validateAndResolvePath(filePath);

    // If oldContent is empty and file exists, delete it
    if (!oldContent || (typeof oldContent === 'string' && oldContent.trim() === '')) {
      if (existsSync(fullPath)) {
        await fs.unlink(fullPath);
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

    // Restore old content
    const parentDir = dirname(fullPath);
    await fs.mkdir(parentDir, { recursive: true });
    await fs.writeFile(fullPath, sanitizedContent, 'utf-8');

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

