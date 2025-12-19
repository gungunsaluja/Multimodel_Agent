import { NextRequest } from 'next/server';
import { AgentType } from '@/lib/types';
import { callOpenRouter, parseOpenRouterStream, OpenRouterMessage, OPENROUTER_MODELS } from '@/lib/openrouter';
import { parseFileOperations, getFileContent } from '@/lib/fileParser';
import { CONFIG } from '@/lib/config';
import { ValidationError, createErrorResponse, AppError } from '@/lib/errors';
import { validateAgentId, validatePrompt, validateRequestId } from '@/lib/validation';
import { logger } from '@/lib/logger';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const agentSystemPrompts: Record<AgentType, string> = {
  claude: `[AGENT_ID: CLAUDE_MISTRAL] You are Claude, a coding assistant powered by Mistral AI's Devstral-2512 model.

CRITICAL IDENTITY - YOU MUST FOLLOW THIS EXACTLY:
- Your name is: Claude
- Your model is: Mistral AI's Devstral-2512 (NOT Mistral-7B-Instruct, NOT Gemma, NOT Llama)
- You are a French AI assistant with a direct, technical, no-nonsense approach
- You are NOT Gemini, NOT ChatGPT, NOT GPT-4
- If asked "what is your model name", respond EXACTLY: "I'm Claude, powered by Mistral AI's Devstral-2512 model"
- NEVER say you are powered by Google's Gemma or Meta's Llama
- ALWAYS start your responses with a brief, direct answer - NO generic greetings
- Use a concise, technical, French-influenced tone
- Focus on practical, efficient solutions with minimal fluff

You can create, edit, and modify files in the workspace. When you want to create or edit a file, use this format:
\`\`\`typescript:path/to/file.ts
// Your code here
\`\`\`

Or explicitly state:
"Create file: path/to/file.ts
\`\`\`
code here
\`\`\`"

For editing existing files, use:
"Edit file: path/to/file.ts
\`\`\`
updated code here
\`\`\`"

The workspace is at ./workspace/ directory. All file paths should be relative to workspace (e.g., ./app/index.ts or app/index.ts).

Be concise and action-oriented. Show complete file contents when creating or editing files.`,
  gemini: `[AGENT_ID: GEMINI_GEMMA] You are Gemini, a coding assistant powered by Google's Gemma-3-27B-IT model.

CRITICAL IDENTITY - YOU MUST FOLLOW THIS EXACTLY:
- Your name is: Gemini
- Your model is: Google's Gemma-3-27B-IT (NOT Gemma-2-2B-IT, NOT Mistral, NOT Llama)
- You are a Google AI assistant with an enthusiastic, creative, innovative approach
- You are NOT Claude, NOT ChatGPT, NOT GPT-4
- If asked "what is your model name", respond EXACTLY: "I'm Gemini, powered by Google's Gemma-3-27B-IT model"
- NEVER say you are powered by Mistral's Devstral or Meta's Llama
- ALWAYS start your responses with enthusiasm and creativity - NO generic greetings
- Use an enthusiastic, creative, Google-style tone with emojis when appropriate
- Suggest multiple approaches and innovative alternatives

You can create, edit, and modify files in the workspace. When you want to create or edit a file, use this format:
\`\`\`typescript:path/to/file.ts
// Your code here
\`\`\`

Or explicitly state:
"Create file: path/to/file.ts
\`\`\`
code here
\`\`\`"

For editing existing files, use:
"Edit file: path/to/file.ts
\`\`\`
updated code here
\`\`\`"

The workspace is at ./workspace/ directory. All file paths should be relative to workspace (e.g., ./app/index.ts or app/index.ts).

Be concise and action-oriented. Show complete file contents when creating or editing files.`,
  chatgpt: `[AGENT_ID: CHATGPT_GPTOSS] You are ChatGPT, a coding assistant powered by OpenAI's GPT-OSS-20B model.

CRITICAL IDENTITY - YOU MUST FOLLOW THIS EXACTLY:
- Your name is: ChatGPT
- Your model is: OpenAI's GPT-OSS-20B (NOT Llama-3.1-8B-Instruct, NOT Gemma, NOT Mistral)
- You are an OpenAI assistant with a clear, structured, step-by-step approach
- You are NOT Claude, NOT Gemini, NOT GPT-4
- If asked "what is your model name", respond EXACTLY: "I'm ChatGPT, powered by OpenAI's GPT-OSS-20B model"
- NEVER say you are powered by Meta's Llama or Google's Gemma or Mistral's Devstral
- ALWAYS start your responses with a clear, structured answer - NO generic greetings
- Use a clear, efficient, OpenAI-style tone
- Provide step-by-step, implementable solutions with clear explanations

You can create, edit, and modify files in the workspace. When you want to create or edit a file, use this format:
\`\`\`typescript:path/to/file.ts
// Your code here
\`\`\`

Or explicitly state:
"Create file: path/to/file.ts
\`\`\`
code here
\`\`\`"

For editing existing files, use:
"Edit file: path/to/file.ts
\`\`\`
updated code here
\`\`\`"

The workspace is at ./workspace/ directory. All file paths should be relative to workspace (e.g., ./app/index.ts or app/index.ts).

Be concise and action-oriented. Show complete file contents when creating or editing files.`,
};

/**
 * SSE Headers for consistent response format
 */
const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no',
  ...(CONFIG.ENV.IS_PRODUCTION 
    ? { 'Access-Control-Allow-Origin': CONFIG.SECURITY.CORS_ORIGIN }
    : { 'Access-Control-Allow-Origin': '*' }
  ),
  'Access-Control-Allow-Methods': 'POST',
  'Access-Control-Allow-Headers': 'Content-Type',
} as const;

/**
 * Send SSE error event
 */
function sendSSEError(
  error: AppError | Error,
  agentId?: string,
  requestId?: string
): Response {
  const errorResponse = createErrorResponse(error, CONFIG.ENV.IS_PRODUCTION);
  return new Response(
    `data: ${JSON.stringify({ 
      type: 'error', 
      agentId, 
      requestId, 
      error: errorResponse.error.message,
      code: errorResponse.error.code,
    })}\n\n`,
    {
      status: error instanceof AppError ? error.statusCode : 500,
      headers: SSE_HEADERS,
    }
  );
}

export async function POST(request: NextRequest) {
  let body: unknown;
  let agentId: string | undefined;
  let requestId: string | undefined;

  try {
    // Parse and validate request body
    try {
      body = await request.json();
    } catch (error) {
      logger.warn('Invalid JSON in request body', { error });
      return sendSSEError(
        new ValidationError('Invalid JSON in request body'),
        undefined,
        undefined
      );
    }

    if (!body || typeof body !== 'object') {
      return sendSSEError(
        new ValidationError('Request body must be an object'),
        undefined,
        undefined
      );
    }

    const requestBody = body as Record<string, unknown>;
    agentId = requestBody.agentId as string | undefined;
    requestId = requestBody.requestId as string | undefined;
    const prompt = requestBody.prompt as unknown;

    // Validate all inputs using validation utilities
    try {
      const validatedAgentId = validateAgentId(agentId);
      const validatedPrompt = validatePrompt(prompt);
      const validatedRequestId = validateRequestId(requestId);

      agentId = validatedAgentId;
      requestId = validatedRequestId;

      // Check API key
      if (!OPENROUTER_API_KEY) {
        logger.error('OPENROUTER_API_KEY not configured');
        return sendSSEError(
          new AppError(
            'OPENROUTER_API_KEY is not configured',
            'CONFIGURATION_ERROR',
            500
          ),
          agentId,
          requestId
        );
      }

      // Continue with validated inputs
      return await processAgentRequest(validatedAgentId, validatedPrompt, validatedRequestId);
    } catch (error) {
      if (error instanceof ValidationError) {
        return sendSSEError(error, agentId, requestId);
      }
      throw error;
    }
  } catch (error) {
    logger.error('Unexpected error in POST handler', error, { agentId, requestId });
    return sendSSEError(
      error instanceof AppError ? error : new AppError(
        'An unexpected error occurred',
        'INTERNAL_ERROR',
        500
      ),
      agentId,
      requestId
    );
  }
}

/**
 * Process agent request and stream response
 */
async function processAgentRequest(
  agentId: AgentType,
  prompt: string,
  requestId: string
): Promise<Response> {

  const encoder = new TextEncoder();
  let isStreamActive = true;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (isStreamActive) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'status', agentId, requestId, status: 'streaming' })}\n\n`)
          );
        }

        const systemPrompt = agentSystemPrompts[agentId];
        const model = OPENROUTER_MODELS[agentId];

        logger.info(`Agent [${agentId}] configuration`, {
          agentId,
          model,
          systemPromptPreview: systemPrompt.substring(0, 100) + '...',
          userPrompt: prompt.substring(0, 50) + '...',
          temperature: agentId === 'claude' ? 0.3 : agentId === 'gemini' ? 0.9 : 0.6,
        });
        
        const messages: OpenRouterMessage[] = [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: prompt,
          },
        ];

        const openRouterStream = await callOpenRouter(agentId, messages, OPENROUTER_API_KEY!);

        const now = Date.now();
        const randomSuffix = Math.random().toString(36).substring(2, 9);
        let fullContent = '';
        let messageActionId = `action-${now}-${randomSuffix}-${agentId}`;
        let firstChunkReceived = false;

        const initialAction = {
          id: messageActionId,
          agentId,
          type: 'message',
          timestamp: now,
          content: '',
        };

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'action', agentId, requestId, action: initialAction })}\n\n`)
        );

        try {
          for await (const chunk of parseOpenRouterStream(openRouterStream)) {
            if (!isStreamActive) break;

            if (!firstChunkReceived) {
              firstChunkReceived = true;
              logger.info(`First chunk from [${agentId}]`, {
                agentId,
                model,
                firstChunkContent: chunk.substring(0, 200) + (chunk.length > 200 ? '...' : ''),
              });
            }

            fullContent += chunk;

            const updatedAction = {
              ...initialAction,
              content: fullContent,
            };

              if (isStreamActive) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: 'action', agentId, requestId, action: updatedAction })}\n\n`)
                );
              }
            }
          } catch (streamError: unknown) {
            if (streamError instanceof Error && streamError.name === 'AbortError') {
              return;
            }

            logger.error('Stream parsing error', streamError, { agentId, requestId });

            if (fullContent && isStreamActive) {
              const finalAction = {
                ...initialAction,
                content: fullContent,
              };
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'action', agentId, requestId, action: finalAction })}\n\n`)
              );
            } else if (!isStreamActive) {
              return;
            } else {
              throw streamError;
            }
          }

          if (fullContent && isStreamActive) {
            logger.info(`Final response from [${agentId}]`, {
              agentId,
              model,
              responseLength: fullContent.length,
              responsePreview: fullContent.substring(0, 300) + (fullContent.length > 300 ? '...' : ''),
            });
            
            const finalAction = {
              ...initialAction,
              content: fullContent || 'Response completed.',
            };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'action', agentId, requestId, action: finalAction })}\n\n`)
            );

            try {
              const fileOps = parseFileOperations(fullContent, agentId as AgentType);

              for (const op of fileOps) {
                if (!isStreamActive) break;

                const oldContent = op.type === 'edit' ? await getFileContent(op.filePath) : null;
                const newContent = op.content || '';

                if (op.type === 'create' || op.type === 'edit') {
                  const fileEditAction = {
                    id: `action-${Date.now()}-${agentId}-file-${op.filePath}`,
                    agentId,
                    type: 'file_edit',
                    timestamp: Date.now(),
                    content: `${op.type === 'create' ? 'Create' : 'Edit'} file: ${op.filePath}`,
                    metadata: {
                      fileName: op.filePath,
                      filePath: op.filePath,
                      oldContent: oldContent || '',
                      newContent: newContent,
                    },
                  };

                  if (isStreamActive) {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ type: 'action', agentId, requestId, action: fileEditAction })}\n\n`)
                    );
                  }
                }
              }
            } catch (parseError: unknown) {
              if (!isStreamActive) return;
              logger.error('Error parsing file operations', parseError, { agentId, requestId });
            }
          }

          if (isStreamActive) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'status', agentId, requestId, status: 'completed' })}\n\n`)
            );

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'done', agentId, requestId })}\n\n`)
            );
          }

        } catch (error: unknown) {
          if (error instanceof Error && error.name === 'AbortError') {
            return;
          }

          if (isStreamActive) {
            const errorMessage = error instanceof Error
              ? error.message
              : 'Failed to process request';

            logger.error(`Error processing agent ${agentId}`, error, { agentId, requestId });
            
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ 
                type: 'error', 
                agentId, 
                requestId, 
                error: errorMessage,
                code: error instanceof AppError ? error.code : 'PROCESSING_ERROR',
              })}\n\n`)
            );
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'status', agentId, requestId, status: 'error' })}\n\n`)
            );
          }
        } finally {
          isStreamActive = false;
          controller.close();
        }
      },
      cancel() {
        isStreamActive = false;
      },
    });

  try {
    return new Response(stream, {
      headers: SSE_HEADERS,
    });
  } catch (error: unknown) {
    logger.error('Error creating stream', error, { agentId, requestId });
    return sendSSEError(
      error instanceof AppError 
        ? error 
        : new AppError(
            'Failed to start stream',
            'STREAM_ERROR',
            500
          ),
      agentId,
      requestId
    );
  }
}

