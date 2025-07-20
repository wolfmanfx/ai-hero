import type { Message } from "ai";
import {
  streamText,
  createDataStreamResponse,
  appendResponseMessages,
} from "ai";
import { z } from "zod";
import { model } from "~/model";
import { auth } from "~/server/auth";
import { searchSerper } from "~/serper";
import { checkRateLimit, recordRequest } from "~/server/rate-limiter";
import { upsertChat } from "~/server/db/chat-helpers";
import { Langfuse } from "langfuse";
import { env } from "~/env";
import { bulkCrawlWebsites } from "~/crawler";

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
  };

  // Create Langfuse trace early, will update sessionId later
  const trace = langfuse.trace({
    name: "chat",
    userId: session.user.id,
  });

  // Check rate limit
  let rateLimitStatus;
  try {
    const rateLimitSpan = trace.span({
      name: "check-rate-limit",
      input: {
        userId: session.user.id,
      },
    });

    rateLimitStatus = await checkRateLimit(session.user.id);

    rateLimitSpan.end({
      output: {
        allowed: rateLimitStatus.allowed,
        limit: rateLimitStatus.limit,
        remaining: rateLimitStatus.remaining,
        isAdmin: rateLimitStatus.isAdmin,
      },
    });

    if (!rateLimitStatus.allowed) {
      return new Response(
        JSON.stringify({
          error: "Too Many Requests",
          message: "Daily limit exceeded",
          limit: rateLimitStatus.limit,
          remaining: 0,
        }),
        { 
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': rateLimitStatus.limit.toString(),
            'X-RateLimit-Remaining': '0',
          }
        }
      );
    }

    // Record the request
    const recordRequestSpan = trace.span({
      name: "record-request",
      input: {
        userId: session.user.id,
      },
    });

    await recordRequest(session.user.id);

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
      
      // Get the title from the first user message
      const firstUserMessage = messages.find(m => m.role === 'user');
      const title = firstUserMessage?.content?.toString().slice(0, 100) ?? 'New Chat';
      
      // Save the initial state of the chat (with user's message)
      const upsertChatSpan = trace.span({
        name: "upsert-chat-initial",
        input: {
          userId: session.user.id,
          chatId: chatId,
          title: title,
          messageCount: messages.length,
          isNewChat: isNewChat,
        },
      });

      await upsertChat({
        userId: session.user.id,
        chatId: chatId,
        title,
        messages,
      });

      upsertChatSpan.end({
        output: {
          success: true,
          chatId: chatId,
        },
      });

      // Send NEW_CHAT_CREATED event if this is a new chat
      if (isNewChat) {
        dataStream.writeData({
          type: "NEW_CHAT_CREATED",
          chatId: chatId,
        });
      }

      const currentDate = new Date().toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        timeZone: 'UTC'
      });
      
      const result = streamText({
        model,
        messages,
        system: `You are a helpful AI assistant with access to web search capabilities and web scraping. 

Today's date is ${currentDate} (UTC).

IMPORTANT: When users ask for "latest", "recent", "current", or "up-to-date" information, always include relevant date qualifiers in your search queries (e.g., "2024", "December 2024", "today", etc.) to ensure you find the most recent information.

You MUST follow these steps for EVERY user question:
1. ALWAYS use the searchWeb tool first to find relevant websites
2. ALWAYS use the scrapePages tool to get detailed content from at least 5 different domains

When selecting URLs to scrape:
- Choose at least 5 URLs from DIFFERENT domains (e.g., not all from wikipedia.org)
- Prioritize diverse, authoritative sources
- Include a mix of different perspectives and information types
- If search returns fewer than 5 different domains, search again with a modified query
- Pay attention to publication dates and prioritize recent content when users ask for current information

The scrapePages tool accepts up to 5 URLs at once, so you should:
- Select the 5 most relevant URLs from different domains
- Ensure domain diversity (e.g., one from wikipedia, one from a news site, one from a technical site, etc.)

Always cite your sources with inline links when providing information.
When available, mention the publication date of your sources.
Base your response on the full content from the scraped pages, not just search snippets.
Format your responses in a clear and helpful manner with comprehensive information.`,
        maxSteps: 10,
        experimental_telemetry: {
          isEnabled: true,
          functionId: "agent",
          metadata: {
            langfuseTraceId: trace.id,
          },
        },
        tools: {
          searchWeb: {
            parameters: z.object({
              query: z.string().describe("The query to search the web for"),
            }),
            execute: async ({ query }, { abortSignal }) => {
              const results = await searchSerper(
                { q: query, num: 10 },
                abortSignal,
              );

              return results.organic.map((result: any) => ({
                title: result.title,
                link: result.link,
                snippet: result.snippet,
                date: result.date || null,
              }));
            },
          },
          scrapePages: {
            parameters: z.object({
              urls: z.array(z.string().url()).describe("The URLs to scrape (maximum 5 URLs at once)").max(5),
            }),
            execute: async ({ urls }) => {
              const results = await bulkCrawlWebsites({ urls });
              
              if (!results.success) {
                return {
                  error: results.error,
                  results: results.results.map(r => ({
                    url: r.url,
                    success: r.result.success,
                    content: r.result.success ? r.result.data : undefined,
                    error: !r.result.success ? r.result.error : undefined,
                  })),
                };
              }
              
              return {
                results: results.results.map(r => ({
                  url: r.url,
                  success: true,
                  content: r.result.data,
                })),
              };
            },
          },
        },
        onFinish: async ({ response }) => {
          // Get the response messages generated by the AI
          const responseMessages = response.messages;
          
          // Merge the original messages with the AI's response messages
          const updatedMessages = appendResponseMessages({
            messages,
            responseMessages,
          });
          
          // Save the complete chat with all messages to the database
          const upsertChatFinalSpan = trace.span({
            name: "upsert-chat-final",
            input: {
              userId: session.user.id,
              chatId: chatId,
              title: title,
              messageCount: updatedMessages.length,
              hasAIResponse: true,
            },
          });

          await upsertChat({
            userId: session.user.id,
            chatId: chatId,
            title,
            messages: updatedMessages,
          });

          upsertChatFinalSpan.end({
            output: {
              success: true,
              chatId: chatId,
              totalMessages: updatedMessages.length,
            },
          });
          
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