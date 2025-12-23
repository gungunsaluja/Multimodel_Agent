import { AgentType } from './types';
import { promises as fs } from 'fs';
import { resolve, dirname } from 'path';
import { CONFIG } from './config';
import { validateFilePath, sanitizeFileContent } from './validation';
import { logger } from './logger';
import { ValidationError } from './errors';

const WORKSPACE_ROOT = resolve(process.cwd(), CONFIG.FILE_SYSTEM.WORKSPACE_ROOT);

export interface ParsedFileOperation {
  type: 'create' | 'edit' | 'delete';
  filePath: string;
  content?: string;
  oldContent?: string;
}


export function parseFileOperations(
  content: string,
  agentId: AgentType
): ParsedFileOperation[] {
  const operations: ParsedFileOperation[] = [];

 
  const codeBlockPattern = /```(?:\w+)?:?([^\n]+)?\n([\s\S]*?)```/g;
  let match;

  while ((match = codeBlockPattern.exec(content)) !== null) {
    const filePathHint = match[1]?.trim();
    const codeContent = match[2];

    if (filePathHint && codeContent) {
      // Extract file path from hint (could be in format "path/to/file.ts" or "// path/to/file.ts")
      const filePath = filePathHint
        .replace(/^\/\/\s*/, '')
        .replace(/^file:\s*/, '')
        .replace(/^path:\s*/, '')
        .trim();

      if (filePath && !filePath.includes('```')) {
        operations.push({
          type: 'edit',
          filePath: normalizePath(filePath),
          content: codeContent.trim(),
        });
      }
    }
  }

  // Pattern 2: Explicit file operation markers
  // Example: "Create file: path/to/file.ts\n```\ncontent\n```"
  const createPattern = /(?:create|new|add)\s+file[:\s]+([^\n]+)\n```[\s\S]*?```/gi;
  while ((match = createPattern.exec(content)) !== null) {
    const filePath = match[1].trim();
    const nextCodeBlock = content.substring(match.index + match[0].length);
    const codeMatch = nextCodeBlock.match(/```[\s\S]*?```/);
    if (codeMatch) {
      const codeContent = codeMatch[0].replace(/```/g, '').trim();
      operations.push({
        type: 'create',
        filePath: normalizePath(filePath),
        content: codeContent,
      });
    }
  }

  // Pattern 3: "Edit file: path" followed by code block
  const editPattern = /(?:edit|update|modify|change)\s+file[:\s]+([^\n]+)\n```[\s\S]*?```/gi;
  while ((match = editPattern.exec(content)) !== null) {
    const filePath = match[1].trim();
    const nextCodeBlock = content.substring(match.index + match[0].length);
    const codeMatch = nextCodeBlock.match(/```[\s\S]*?```/);
    if (codeMatch) {
      const codeContent = codeMatch[0].replace(/```/g, '').trim();
      operations.push({
        type: 'edit',
        filePath: normalizePath(filePath),
        content: codeContent,
      });
    }
  }

  return operations;
}

/**
 * Normalize file path to workspace-relative path
 */
function normalizePath(filePath: string): string {
  // Remove leading ./ or workspace/
  let normalized = filePath.replace(/^\.\//, '').replace(/^workspace\//, '');
  
  // Ensure it starts with ./
  if (!normalized.startsWith('./')) {
    normalized = './' + normalized;
  }
  
  return normalized;
}

/**
 * Read existing file content if it exists
 * @param filePath - Relative file path from workspace root
 * @returns File content or null if file doesn't exist
 */
export async function getFileContent(filePath: string): Promise<string | null> {
  try {
    // Validate path to prevent traversal
    const validated = validateFilePath(filePath, WORKSPACE_ROOT);
    const fullPath = resolve(WORKSPACE_ROOT, validated);
    
    // Check file size before reading
    const stats = await fs.stat(fullPath);
    if (stats.size > CONFIG.FILE_SYSTEM.MAX_FILE_SIZE) {
      logger.warn('File too large to read', { filePath, size: stats.size });
      return null;
    }

    const content = await fs.readFile(fullPath, 'utf-8');
    return content;
  } catch (error) {
    // File doesn't exist or other error - return null silently
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    logger.warn('Error reading file', { filePath, error });
    return null;
  }
}

/**
 * Write file content (create or edit)
 * @param filePath - Relative file path from workspace root
 * @param content - File content to write
 * @returns Success status and message
 */
export async function writeFile(filePath: string, content: string): Promise<{ success: boolean; message: string }> {
  try {
    // Validate path to prevent traversal
    const validated = validateFilePath(filePath, WORKSPACE_ROOT);
    const fullPath = resolve(WORKSPACE_ROOT, validated);
    
    // Ensure parent directory exists
    const parentDir = dirname(fullPath);
    await fs.mkdir(parentDir, { recursive: true });
    
    // Sanitize and validate content
    const sanitizedContent = sanitizeFileContent(content);
    
    // Write the file
    await fs.writeFile(fullPath, sanitizedContent, 'utf-8');
    
    logger.info('File written', { filePath, size: sanitizedContent.length });
    
    return { success: true, message: 'File written successfully' };
  } catch (error) {
    if (error instanceof ValidationError) {
      logger.error('Validation error writing file', { filePath, error });
      throw error;
    }
    logger.error('Error writing file', { filePath, error });
    throw new Error(`Failed to write file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

