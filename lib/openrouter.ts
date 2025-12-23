import { AgentType } from './types';
import { CONFIG } from './config';
import { logger } from './logger';
import { ExternalAPIError, TimeoutError } from './errors';

export const OPENROUTER_MODELS: Record<AgentType, string> = {
  claude: 'anthropic/claude-sonnet-4',
  gemini: 'google/gemini-3-flash-preview',
  chatgpt: 'openai/gpt-5.2',
} as const;

export type OpenRouterContent = 
  | string
  | Array<{
      type: 'text';
      text: string;
    } | {
      type: 'image_url';
      image_url: {
        url: string;
      };
    }>;

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: OpenRouterContent;
}

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
  
  const hasImages = messages.some(msg => 
    Array.isArray(msg.content) && 
    msg.content.some(item => item.type === 'image_url')
  );

  if (hasImages) {
    logger.info('Images detected - using vision-capable model', {
      agentId,
      model,
      note: 'All models support vision/image processing.',
    });
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
    hasImages,
  });

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
        
        if (hasImages && (errorMessage.includes('image input') || errorMessage.includes('vision') || response.status === 404)) {
          errorMessage = `This model (${model}) does not support image input. Please use text-only prompts or switch to a vision-capable model.`;
        }
      } catch {
        errorMessage = errorText || errorMessage;
      }

      logger.error('OpenRouter API error', new Error(errorMessage), {
        agentId,
        model,
        status: response.status,
        details: errorDetails,
        hasImages,
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
