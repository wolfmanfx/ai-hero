import type { Message } from "ai";
import {
  streamText,
  createDataStreamResponse,
} from "ai";
import { z } from "zod";
import { model } from "~/model";
import { auth } from "~/server/auth";
import { searchSerper } from "~/serper";

export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await auth();
  
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = (await request.json()) as {
    messages: Array<Message>;
  };

  return createDataStreamResponse({
    execute: async (dataStream) => {
      const { messages } = body;

      const result = streamText({
        model,
        messages,
        system: `You are a helpful AI assistant with access to web search capabilities. 
When a user asks you a question, you should always use the searchWeb tool to find the most up-to-date and accurate information.
Always cite your sources with inline links when providing information from search results.
Format your responses in a clear and helpful manner, including relevant links from the search results.`,
        maxSteps: 10,
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

              return results.organic.map((result) => ({
                title: result.title,
                link: result.link,
                snippet: result.snippet,
              }));
            },
          },
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