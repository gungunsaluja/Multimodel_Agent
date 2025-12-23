import { NextRequest } from 'next/server';
import { promises as fs, existsSync } from 'fs';
import { resolve, relative } from 'path';
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
 * Recursively get all files from a directory
 */
async function getAllFiles(dirPath: string, basePath: string = '', fileList: Array<{ name: string; path: string }> = []): Promise<Array<{ name: string; path: string }>> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = resolve(dirPath, entry.name);
      const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
      
      // Skip if outside workspace
      const relativeEntry = relative(WORKSPACE_ROOT, fullPath);
      if (relativeEntry.startsWith('..') || relativeEntry.includes('..')) {
        continue;
      }
      
      if (entry.isDirectory()) {
        await getAllFiles(fullPath, relativePath, fileList);
      } else if (entry.isFile()) {
        fileList.push({
          name: entry.name,
          path: relativePath,
        });
      }
    }
  } catch (error) {
    logger.error('Error reading directory', { dirPath, error });
  }
  
  return fileList;
}

/**
 * Search/list all files in workspace for autocomplete
 */
export async function GET(request: NextRequest) {
  try {
    if (!existsSync(WORKSPACE_ROOT)) {
      await fs.mkdir(WORKSPACE_ROOT, { recursive: true });
    }

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q') || '';

    // Get all files recursively
    const allFiles = await getAllFiles(WORKSPACE_ROOT);
    
    // Filter by query if provided
    const filteredFiles = query
      ? allFiles.filter(file => 
          file.name.toLowerCase().includes(query.toLowerCase()) ||
          file.path.toLowerCase().includes(query.toLowerCase())
        )
      : allFiles;

    // Sort by relevance (exact matches first, then by name)
    filteredFiles.sort((a, b) => {
      const aExact = a.name.toLowerCase() === query.toLowerCase() || a.path.toLowerCase() === query.toLowerCase();
      const bExact = b.name.toLowerCase() === query.toLowerCase() || b.path.toLowerCase() === query.toLowerCase();
      
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      
      return a.name.localeCompare(b.name);
    });

    // Limit results
    const limitedFiles = filteredFiles.slice(0, 50);

    return new Response(
      JSON.stringify({ success: true, files: limitedFiles }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    logger.error('Error in GET /api/files/search', error);
    const errorResponse = createErrorResponse(
      error instanceof ValidationError
        ? error
        : new Error('Failed to search files'),
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

