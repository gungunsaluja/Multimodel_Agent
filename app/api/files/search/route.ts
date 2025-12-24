import { NextRequest } from 'next/server';
import { CONFIG } from '@/lib/config';
import { ValidationError, createErrorResponse } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { listFiles } from '@/lib/blobStorage';

/**
 * Search/list all files in workspace for autocomplete
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q') || '';

    // Get all files from blob storage
    const allFiles = await listFiles();
    
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


