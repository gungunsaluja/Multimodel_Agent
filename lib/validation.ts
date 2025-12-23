import { resolve, relative, normalize } from 'path';
import { CONFIG } from './config';
import { ValidationError } from './errors';
import { AgentType } from './types';


export function validateFilePath(filePath: string, workspaceRoot: string): string {
  if (!filePath || typeof filePath !== 'string') {
    throw new ValidationError('File path is required and must be a string');
  }

  let normalized = filePath.replace(/^\.\//, '');
  
  if (normalized === 'workspace' || normalized.startsWith('workspace/')) {
    normalized = normalized === 'workspace' ? '' : normalized.substring('workspace/'.length);
  }
  
  normalized = normalize(normalized);
  
  const resolvedPath = resolve(workspaceRoot, normalized);
  const resolvedRoot = resolve(workspaceRoot);
  
  const relativePath = relative(resolvedRoot, resolvedPath);
  
  if (relativePath.startsWith('..') || relativePath.includes('..')) {
    throw new ValidationError('Path traversal detected', {
      attemptedPath: filePath,
    });
  }

  if (normalized.length > 260) {
    throw new ValidationError('File path too long (max 260 characters)');
  }

  const dangerousChars = /[<>:"|?*\x00-\x1f]/;
  if (dangerousChars.test(normalized)) {
    throw new ValidationError('File path contains invalid characters');
  }

  return normalized;
}

export function validateAgentId(agentId: unknown): AgentType {
  if (!agentId || typeof agentId !== 'string') {
    throw new ValidationError('Agent ID is required and must be a string');
  }

  if (!CONFIG.AGENTS.VALID_IDS.includes(agentId as AgentType)) {
    throw new ValidationError(
      `Invalid agent ID. Must be one of: ${CONFIG.AGENTS.VALID_IDS.join(', ')}`,
      { provided: agentId }
    );
  }

  return agentId as AgentType;
}

export function validatePrompt(prompt: unknown, allowEmpty: boolean = false): string {
  if (prompt === undefined || prompt === null) {
    if (allowEmpty) {
      return '';
    }
    throw new ValidationError('Prompt is required and must be a string');
  }

  if (typeof prompt !== 'string') {
    throw new ValidationError('Prompt must be a string');
  }

  const trimmed = prompt.trim();

  if (!allowEmpty && trimmed.length < CONFIG.API.MIN_PROMPT_LENGTH) {
    throw new ValidationError(
      `Prompt must be at least ${CONFIG.API.MIN_PROMPT_LENGTH} character(s)`,
      { length: trimmed.length }
    );
  }

  if (trimmed.length > CONFIG.API.MAX_PROMPT_LENGTH) {
    throw new ValidationError(
      `Prompt too long. Maximum length is ${CONFIG.API.MAX_PROMPT_LENGTH} characters`,
      { length: trimmed.length, maxLength: CONFIG.API.MAX_PROMPT_LENGTH }
    );
  }

  return trimmed;
}

export function validateRequestId(requestId: unknown): string {
  if (!requestId || typeof requestId !== 'string') {
    throw new ValidationError('Request ID is required and must be a string');
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(requestId)) {
    throw new ValidationError('Request ID contains invalid characters');
  }

  if (requestId.length > 100) {
    throw new ValidationError('Request ID too long (max 100 characters)');
  }

  return requestId;
}

export function sanitizeFileContent(content: string, maxSize: number = CONFIG.FILE_SYSTEM.MAX_FILE_SIZE): string {
  if (typeof content !== 'string') {
    throw new ValidationError('File content must be a string');
  }

  const sizeBytes = new TextEncoder().encode(content).length;
  if (sizeBytes > maxSize) {
    throw new ValidationError(
      `File content too large. Maximum size is ${maxSize} bytes`,
      { size: sizeBytes, maxSize }
    );
  }

  return content.replace(/\0/g, '');
}
