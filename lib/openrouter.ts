import { AgentType } from './types';
import { CONFIG } from './config';
import { logger } from './logger';
import { ExternalAPIError, TimeoutError } from './errors';

/**
 * Model mappings for each agent
 */
export const OPENROUTER_MODELS: Record<AgentType, string> = {
  claude:  "mistralai/devstral-2512:free",
  gemini:  "google/gemma-3-27b-it:free",
  chatgpt: "openai/gpt-oss-20b:free",
} as const;

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Call OpenRouter API with proper error handling and timeouts
 * @param agentId - The agent identifier
 * @param messages - Array of messages to send
 * @param apiKey - OpenRouter API key
 * @returns ReadableStream of the response
 * @throws {ExternalAPIError} If the API call fails
 * @throws {TimeoutError} If the request times out
 */
export async function callOpenRouter(
  agentId: AgentType,
  messages: OpenRouterMessage[],
  apiKey: string
): Promise<ReadableStream<Uint8Array>> {
  if (!OPENROUTER_MODELS[agentId]) {
    throw new Error(`Invalid agentId: ${agentId}. Valid agents: ${Object.keys(OPENROUTER_MODELS).join(', ')}`);
  }

  const model = OPENROUTER_MODELS[agentId];
  const allModels = Object.values(OPENROUTER_MODELS);
  const uniqueModels = new Set(allModels);
  if (uniqueModels.size !== allModels.length) {
    logger.error('Duplicate models detected', { models: allModels });
    throw new Error('Each agent must use a different model');
  }
  
  const requestBody = {
    model,
    messages,
    stream: true,
    max_tokens: CONFIG.API.MAX_TOKENS,
    temperature: CONFIG.AGENTS.TEMPERATURE[agentId],
  };

  logger.debug('Calling OpenRouter API', {
    agentId,
    model,
    temperature: CONFIG.AGENTS.TEMPERATURE[agentId],
    messageCount: messages.length,
  });

  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, CONFIG.API.REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'Multi-Agent Coding Interface',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `OpenRouter API error: ${response.status} ${response.statusText}`;
      let errorDetails: Record<string, unknown> = { status: response.status };

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorJson.message || errorText;
        errorDetails = { ...errorDetails, ...errorJson };
      } catch {
        errorMessage = errorText || errorMessage;
      }

      logger.error('OpenRouter API error', new Error(errorMessage), {
        agentId,
        model,
        status: response.status,
        details: errorDetails,
      });

      throw new ExternalAPIError(errorMessage, 'OpenRouter');
    }
  
    logger.info('OpenRouter API call successful', { agentId, model });

    if (!response.body) {
      throw new ExternalAPIError('No response body from OpenRouter', 'OpenRouter');
    }

    return response.body;
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error && error.name === 'AbortError') {
      throw new TimeoutError('OpenRouter API request', CONFIG.API.REQUEST_TIMEOUT_MS);
    }
    
    if (error instanceof ExternalAPIError || error instanceof TimeoutError) {
      throw error;
    }

    throw new ExternalAPIError(
      error instanceof Error ? error.message : 'Unknown error',
      'OpenRouter',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Parse OpenRouter streaming response
 * @param stream - ReadableStream from OpenRouter API
 * @yields {string} Content chunks as they arrive
 */
export async function* parseOpenRouterStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<string, void, unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.trim() === '') continue;
        
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            return;
          }
          
          if (data) {
            try {
              const json = JSON.parse(data);
              const content = json.choices?.[0]?.delta?.content;
              if (content && typeof content === 'string') {
                yield content;
              }
            } catch (error) {
              // Skip invalid JSON - might be empty or malformed
              logger.warn('Failed to parse OpenRouter stream chunk', {
                data: data.substring(0, 100),
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

