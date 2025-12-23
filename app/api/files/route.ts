import { NextRequest } from 'next/server';
import { promises as fs, existsSync } from 'fs';
import { join, resolve, relative } from 'path';
import { CONFIG } from '@/lib/config';
import { ValidationError, NotFoundError, createErrorResponse } from '@/lib/errors';
import { validateFilePath, sanitizeFileContent } from '@/lib/validation';
import { logger } from '@/lib/logger';

const PROJECT_ROOT = process.cwd();
const WORKSPACE_ROOT = resolve(PROJECT_ROOT, CONFIG.FILE_SYSTEM.WORKSPACE_ROOT);

if (!existsSync(WORKSPACE_ROOT)) {
  fs.mkdir(WORKSPACE_ROOT, { recursive: true }).catch((error) => {
    logger.error('Failed to create workspace directory', error);
  });
}

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
    if (!existsSync(WORKSPACE_ROOT)) {
      await fs.mkdir(WORKSPACE_ROOT, { recursive: true });
    }

    const searchParams = request.nextUrl.searchParams;
    let pathParam = searchParams.get('path') || './';

    if (pathParam === './workspace' || pathParam === 'workspace' || pathParam.startsWith('./workspace/')) {
      pathParam = pathParam.replace(/^\.\/workspace\/?/, './').replace(/^workspace\/?/, './');
    }

    if (pathParam === './' || pathParam === '' || pathParam === 'workspace') {
      pathParam = './';
    }

    let fullPath: string;
    try {
      fullPath = validateAndResolvePath(pathParam);
    } catch (error) {
      if (pathParam === './' || pathParam === '') {
        fullPath = WORKSPACE_ROOT;
      } else {
        throw error;
      }
    }

    try {
      const stats = await fs.stat(fullPath);
      if (!stats.isDirectory()) {
        throw new ValidationError('Path is not a directory');
      }
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        try {
          await fs.mkdir(fullPath, { recursive: true });
          logger.info('Created directory', { path: fullPath, requestedPath: pathParam });
        } catch (mkdirError) {
          logger.error('Failed to create directory', { path: fullPath, error: mkdirError });
          throw new NotFoundError('Directory');
        }
      } else {
        logger.error('Error checking directory', { path: fullPath, error });
        throw new NotFoundError('Directory');
      }
    }

    const entries = await fs.readdir(fullPath, { withFileTypes: true });

    const files = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = pathParam === './' ? entry.name : `${pathParam}/${entry.name}`;
        const entryFullPath = resolve(WORKSPACE_ROOT, entryPath.startsWith('./') ? entryPath.slice(2) : entryPath);
        
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

    const fullPath = validateAndResolvePath(path);

    if (type === 'directory') {
      await fs.mkdir(fullPath, { recursive: true });
      logger.info('Directory created', { path });
    } else if (type === 'file') {
      const parentDir = resolve(fullPath, '..');
      await fs.mkdir(parentDir, { recursive: true });
      
      const sanitizedContent = content 
        ? sanitizeFileContent(String(content))
        : '';
      
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

async function clearDirectory(dirPath: string): Promise<void> {
  if (!existsSync(dirPath)) {
    return;
  }

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = resolve(dirPath, entry.name);
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

export async function DELETE(request: NextRequest) {
  try {
    if (!existsSync(WORKSPACE_ROOT)) {
      await fs.mkdir(WORKSPACE_ROOT, { recursive: true });
      return new Response(
        JSON.stringify({ success: true, message: 'Workspace is already empty' }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    await clearDirectory(WORKSPACE_ROOT);
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