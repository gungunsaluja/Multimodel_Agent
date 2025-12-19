import { NextRequest } from 'next/server';
import { promises as fs, existsSync } from 'fs';
import { join, resolve, relative } from 'path';
import { CONFIG } from '@/lib/config';
import { ValidationError, NotFoundError, createErrorResponse } from '@/lib/errors';
import { validateFilePath, sanitizeFileContent } from '@/lib/validation';
import { logger } from '@/lib/logger';

const PROJECT_ROOT = process.cwd();
const WORKSPACE_ROOT = resolve(PROJECT_ROOT, CONFIG.FILE_SYSTEM.WORKSPACE_ROOT);

// Ensure workspace directory exists
if (!existsSync(WORKSPACE_ROOT)) {
  fs.mkdir(WORKSPACE_ROOT, { recursive: true }).catch((error) => {
    logger.error('Failed to create workspace directory', error);
  });
}

/**
 * Validate file path and prevent path traversal attacks
 * Uses proper path resolution instead of string comparison
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

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const pathParam = searchParams.get('path') || './';

    // Validate and resolve path
    const fullPath = validateAndResolvePath(pathParam);

    // Ensure directory exists
    try {
      const stats = await fs.stat(fullPath);
      if (!stats.isDirectory()) {
        throw new ValidationError('Path is not a directory');
      }
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new NotFoundError('Directory');
    }

    const entries = await fs.readdir(fullPath, { withFileTypes: true });

    const files = await Promise.all(
      entries.map(async (entry) => {
        // Validate each entry path
        const entryPath = pathParam === './' ? entry.name : `${pathParam}/${entry.name}`;
        const entryFullPath = resolve(WORKSPACE_ROOT, entryPath.startsWith('./') ? entryPath.slice(2) : entryPath);
        
        // Double-check entry is within workspace
        const relativeEntry = relative(WORKSPACE_ROOT, entryFullPath);
        if (relativeEntry.startsWith('..') || relativeEntry.includes('..')) {
          logger.warn('Skipping entry outside workspace', { entryPath, relativeEntry });
          return null;
        }
        
        return {
          name: entry.name,
          path: entryPath,
          type: entry.isDirectory() ? 'directory' : 'file',
        };
      })
    );

    // Filter out null entries and sort: directories first, then files
    const validFiles = files.filter((f): f is NonNullable<typeof f> => f !== null);
    validFiles.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return new Response(
      JSON.stringify({ success: true, files: validFiles }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    logger.error('Error in GET /api/files', error);
    const errorResponse = createErrorResponse(
      error instanceof ValidationError || error instanceof NotFoundError
        ? error
        : new Error('Failed to list files'),
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
    const path = requestBody.path;
    const type = requestBody.type;
    const content = requestBody.content;

    if (!path || typeof path !== 'string') {
      throw new ValidationError('Path is required and must be a string');
    }

    if (!type || typeof type !== 'string' || !['file', 'directory'].includes(type)) {
      throw new ValidationError('Type must be either "file" or "directory"');
    }

    // Validate and resolve path
    const fullPath = validateAndResolvePath(path);

    if (type === 'directory') {
      await fs.mkdir(fullPath, { recursive: true });
      logger.info('Directory created', { path });
    } else if (type === 'file') {
      // Ensure parent directory exists
      const parentDir = resolve(fullPath, '..');
      await fs.mkdir(parentDir, { recursive: true });
      
      // Sanitize and validate content
      const sanitizedContent = content 
        ? sanitizeFileContent(String(content))
        : '';
      
      // Write the file
      await fs.writeFile(fullPath, sanitizedContent, 'utf-8');
      logger.info('File created', { path, size: sanitizedContent.length });
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    logger.error('Error in POST /api/files', error);
    const errorResponse = createErrorResponse(
      error instanceof ValidationError
        ? error
        : new Error('Failed to create file or directory'),
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

