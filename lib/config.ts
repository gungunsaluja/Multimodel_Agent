/**
 * Application configuration constants
 * Centralized configuration for better maintainability
 */

export const CONFIG = {
  // API Configuration
  API: {
    MAX_PROMPT_LENGTH: 100_000,
    MIN_PROMPT_LENGTH: 1,
    MAX_TOKENS: 400,
    REQUEST_TIMEOUT_MS: 120_000, // 2 minutes
    STREAM_CHUNK_SIZE: 1024,
  },

  // File System Configuration
  FILE_SYSTEM: {
    WORKSPACE_ROOT: 'workspace',
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    ALLOWED_FILE_EXTENSIONS: [
      '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.txt',
      '.css', '.html', '.py', '.java', '.cpp', '.c', '.go',
      '.rs', '.rb', '.php', '.sql', '.yaml', '.yml', '.xml',
    ],
  },

  // Agent Configuration
  AGENTS: {
    VALID_IDS: ['claude', 'gemini', 'chatgpt'] as const,
    TEMPERATURE: {
      claude: 0.3,
      gemini: 0.9,
      chatgpt: 0.6,
    },
  },

  // Security Configuration
  SECURITY: {
    CORS_ORIGIN: process.env.NODE_ENV === 'production' 
      ? process.env.NEXT_PUBLIC_APP_URL || 'https://yourdomain.com'
      : '*',
    RATE_LIMIT_WINDOW_MS: 60_000, // 1 minute
    RATE_LIMIT_MAX_REQUESTS: 100,
  },

  // Environment
  ENV: {
    NODE_ENV: process.env.NODE_ENV || 'development',
    IS_PRODUCTION: process.env.NODE_ENV === 'production',
    IS_DEVELOPMENT: process.env.NODE_ENV === 'development',
  },
} as const;

/**
 * Validate that required environment variables are set
 */
export function validateEnvironment(): void {
  const required = ['OPENROUTER_API_KEY'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
}

