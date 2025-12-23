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

function normalizePath(filePath: string): string {
  let normalized = filePath.replace(/^\.\//, '').replace(/^workspace\//, '');
  if (!normalized.startsWith('./')) {
    normalized = './' + normalized;
  }
  return normalized;
}

export async function getFileContent(filePath: string): Promise<string | null> {
  try {
    const validated = validateFilePath(filePath, WORKSPACE_ROOT);
    const fullPath = resolve(WORKSPACE_ROOT, validated);
    const stats = await fs.stat(fullPath);
    if (stats.size > CONFIG.FILE_SYSTEM.MAX_FILE_SIZE) {
      logger.warn('File too large to read', { filePath, size: stats.size });
      return null;
    }

    const content = await fs.readFile(fullPath, 'utf-8');
    return content;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    logger.warn('Error reading file', { filePath, error });
    return null;
  }
}

export async function writeFile(filePath: string, content: string): Promise<{ success: boolean; message: string }> {
  try {
    const validated = validateFilePath(filePath, WORKSPACE_ROOT);
    const fullPath = resolve(WORKSPACE_ROOT, validated);
    const parentDir = dirname(fullPath);
    await fs.mkdir(parentDir, { recursive: true });
    const sanitizedContent = sanitizeFileContent(content);
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

