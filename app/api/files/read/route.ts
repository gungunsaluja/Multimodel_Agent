import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import { resolve } from 'path';
import { CONFIG } from '@/lib/config';
import { ValidationError, NotFoundError, createErrorResponse } from '@/lib/errors';
import { validateFilePath } from '@/lib/validation';
import { logger } from '@/lib/logger';

const PROJECT_ROOT = process.cwd();
const WORKSPACE_ROOT = resolve(PROJECT_ROOT, CONFIG.FILE_SYSTEM.WORKSPACE_ROOT);

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
    const path = searchParams.get('path');

    if (!path) {
      throw new ValidationError('Path is required');
    }

    const fullPath = validateAndResolvePath(path);

    let stats;
    try {
      stats = await fs.stat(fullPath);
    } catch {
      throw new NotFoundError('File');
    }

    if (stats.isDirectory()) {
      throw new ValidationError('Path is a directory, not a file');
    }

    if (stats.size > CONFIG.FILE_SYSTEM.MAX_FILE_SIZE) {
      throw new ValidationError(
        `File too large. Maximum size is ${CONFIG.FILE_SYSTEM.MAX_FILE_SIZE} bytes`,
        { size: stats.size, maxSize: CONFIG.FILE_SYSTEM.MAX_FILE_SIZE }
      );
    }

    const content = await fs.readFile(fullPath, 'utf-8');

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

