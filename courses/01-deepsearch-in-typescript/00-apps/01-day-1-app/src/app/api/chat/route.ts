import {
  createDataStreamResponse,
  type Message,
} from "ai";
import { auth } from "~/server/auth";
import { checkRateLimit, recordRateLimit, type RateLimitConfig } from "~/server/redis/rate-limiter";
import { upsertChat } from "~/server/db/chat-helpers";
import { Langfuse } from "langfuse";
import { env } from "~/env";
import { streamFromDeepSearch } from "~/deep-search";
import type { OurMessageAnnotation } from "~/types/message-annotation";
import { generateChatTitle } from "~/generate-chat-title";
import { geolocation } from "@vercel/functions";

export const maxDuration = 60;

const langfuse = new Langfuse({
  environment: env.NODE_ENV,
});

export async function POST(request: Request) {
  const session = await auth();
  
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = (await request.json()) as {
    messages: Array<Message>;
    chatId: string;
    isNewChat: boolean;
    location?: {
      latitude: number;
      longitude: number;
      city?: string;
      country?: string;
    };
  };

  // Use client-provided location if available, otherwise fall back to IP-based geolocation
  let requestHints: {
    latitude?: string;
    longitude?: string;
    city?: string;
    country?: string;
  };

  if (body.location) {
    // Use location from client
    requestHints = {
      latitude: body.location.latitude.toString(),
      longitude: body.location.longitude.toString(),
      city: body.location.city,
      country: body.location.country,
    };
  } else {
    // Fall back to IP-based geolocation
    const { longitude, latitude, city, country } = geolocation(request);
    requestHints = {
      longitude,
      latitude,
      city,
      country,
    };
  }

  // Create Langfuse trace early, will update sessionId later
  const trace = langfuse.trace({
    name: "chat",
    userId: session.user.id,
  });

  // Check rate limit
  const config: RateLimitConfig = {
    maxRequests: 50,
    maxRetries: 3,
    windowMs: 60_000, // 60 seconds for testing
    keyPrefix: "global",
  };

  try {
    const rateLimitSpan = trace.span({
      name: "check-rate-limit",
      input: {
        userId: session.user.id,
      },
    });

    const rateLimitCheck = await checkRateLimit(config);

    rateLimitSpan.end({
      output: {
        allowed: rateLimitCheck.allowed,
        remaining: rateLimitCheck.remaining,
        totalHits: rateLimitCheck.totalHits,
        resetTime: rateLimitCheck.resetTime,
      },
    });

    if (!rateLimitCheck.allowed) {
      const waitSpan = trace.span({
        name: "rate-limit-wait",
        input: {
          userId: session.user.id,
        },
      });

      const isAllowed = await rateLimitCheck.retry();
      
      waitSpan.end({
        output: {
          allowed: isAllowed,
        },
      });

      // If the rate limit is still exceeded after retries, return a 429
      if (!isAllowed) {
        return new Response("Rate limit exceeded", {
          status: 429,
        });
      }
    }

    // Record the request
    const recordRequestSpan = trace.span({
      name: "record-request",
      input: {
        userId: session.user.id,
      },
    });

    await recordRateLimit(config);

    recordRequestSpan.end({
      output: {
        success: true,
      },
    });
  } catch (error) {
    console.error("Rate limit check failed:", error);
    return new Response("Internal Server Error", { status: 500 });
  }

  return createDataStreamResponse({
    execute: async (dataStream) => {
      const { messages, chatId, isNewChat } = body;
      
      // Update trace with sessionId now that we have chatId
      trace.update({
        sessionId: chatId,
      });
      
      // Start generating title in parallel if this is a new chat
      let titlePromise: Promise<string>;
      if (isNewChat) {
        titlePromise = generateChatTitle(messages);
      } else {
        titlePromise = Promise.resolve("");
      }
      
      // Save the initial state of the chat (with user's message)
      if (isNewChat) {
        const upsertChatSpan = trace.span({
          name: "upsert-chat-initial",
          input: {
            userId: session.user.id,
            chatId: chatId,
            title: "Generating...",
            messageCount: messages.length,
            isNewChat: isNewChat,
          },
        });

        await upsertChat({
          userId: session.user.id,
          chatId: chatId,
          title: "Generating...",
          messages,
        });

        upsertChatSpan.end({
          output: {
            success: true,
            chatId: chatId,
          },
        });
      }

      // Send NEW_CHAT_CREATED event if this is a new chat
      if (isNewChat) {
        dataStream.writeData({
          type: "NEW_CHAT_CREATED",
          chatId: chatId,
        });
      }

      // Collect annotations as they come through
      const annotations: OurMessageAnnotation[] = [];

      const result = await streamFromDeepSearch({
        messages,
        dataStream,
        requestHints,
        telemetry: {
          isEnabled: true,
          functionId: "agent",
          metadata: {
            langfuseTraceId: trace.id,
          },
        },
        onAnnotation: (annotation) => {
          annotations.push(annotation);
        },
        onFinish: async ({ text }) => {
          // For streamText, we need to create the assistant message manually
          const assistantMessage: Message = {
            id: `msg-${Date.now()}`,
            role: 'assistant',
            content: text || '',
            parts: [{ type: 'text', text: text || '' }] as Message["parts"],
          };
          
          // Merge the original messages with the AI's response
          const updatedMessages = [...messages, assistantMessage];
          
          // Wait for the title to be generated
          const title = await titlePromise;
          
          // Save the complete chat with all messages to the database
          const upsertChatFinalSpan = trace.span({
            name: "upsert-chat-final",
            input: {
              userId: session.user.id,
              chatId: chatId,
              title: title || "Chat with assistant",
              messageCount: updatedMessages.length,
              hasAIResponse: true,
              annotationCount: annotations.length,
            },
          });

          try {
            await upsertChat({
              userId: session.user.id,
              chatId: chatId,
              ...(title ? { title } : {}),
              messages: updatedMessages,
              annotations: annotations.length > 0 ? annotations : undefined,
            });

            upsertChatFinalSpan.end({
              output: {
                success: true,
                chatId: chatId,
                totalMessages: updatedMessages.length,
                totalAnnotations: annotations.length,
              },
            });
          } catch (error) {
            upsertChatFinalSpan.end({
              output: {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
              },
            });
          }
          
          // Flush Langfuse trace
          await langfuse.flushAsync();
        },
      });

      result.mergeIntoDataStream(dataStream);
    },
    onError: (e) => {
      console.error(e);
      return "Oops, an error occured!";
    },
  });
}