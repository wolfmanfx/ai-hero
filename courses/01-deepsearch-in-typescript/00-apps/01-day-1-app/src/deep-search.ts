import {
  streamText,
  type Message,
  type TelemetrySettings,
  type LanguageModel,
} from "ai";
import { z } from "zod";
import { model as defaultModel } from "~/model";
import { searchSerper } from "~/serper";
import { bulkCrawlWebsites } from "~/crawler";
import { env } from "~/env";

export const streamFromDeepSearch = (opts: {
  messages: Message[];
  onFinish: Parameters<typeof streamText>[0]["onFinish"];
  telemetry: TelemetrySettings;
  model?: LanguageModel;
}) => {
  const currentDate = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    timeZone: 'UTC'
  });

  return streamText({
    model: opts.model || defaultModel,
    messages: opts.messages,
    maxSteps: 10,
    system: `You are a helpful AI assistant with access to web search capabilities and web scraping. 

Today's date is ${currentDate} (UTC).

IMPORTANT: When users ask for "latest", "recent", "current", or "up-to-date" information, always include relevant date qualifiers in your search queries (e.g., "2024", "December 2024", "today", etc.) to ensure you find the most recent information.

You MUST follow these steps for EVERY user question:
1. ALWAYS use the searchWeb tool first to find ${env.SEARCH_RESULTS_COUNT} relevant websites
2. ALWAYS use the scrapePages tool to get detailed content from at least 5 different domains
3. ALWAYS analyze the scraped content to extract relevant information
4. ALWAYS cite your sources with inline links [like this](URL) for EVERY fact, claim, or piece of information

CRITICAL CITATION REQUIREMENTS:
- EVERY statement, fact, or claim MUST have an inline citation [Source Title](URL)
- Use this exact format: [Brief Source Description](https://example.com/page)
- When paraphrasing or summarizing, still cite the source
- If multiple sources support a fact, cite all of them: [Source 1](URL1), [Source 2](URL2)
- A response without proper citations is INCOMPLETE and UNACCEPTABLE

CITATION EXAMPLES:
✓ GOOD: "The Eiffel Tower is 330 meters tall [Official Eiffel Tower Website](https://www.toureiffel.paris/en)."
✓ GOOD: "Python was created in 1991 [Python History](https://www.python.org/about/history/) and has become one of the most popular programming languages [TIOBE Index](https://www.tiobe.com/tiobe-index/)."
✗ BAD: "The Eiffel Tower is 330 meters tall." (no citation)
✗ BAD: "According to sources, Python was created in 1991." (vague, no link)

When selecting URLs to scrape:
- Choose at least 5 URLs from DIFFERENT domains (e.g., not all from wikipedia.org)
- Prioritize diverse, authoritative sources
- Include a mix of different perspectives and information types
- If search returns fewer than 5 different domains, search again with a modified query
- Pay attention to publication dates and prioritize recent content when users ask for current information

The scrapePages tool accepts up to 5 URLs at once, so you should:
- Select the 5 most relevant URLs from different domains
- Ensure domain diversity (e.g., one from wikipedia, one from a news site, one from a technical site, etc.)

FINAL VALIDATION: Before sending your response, verify that:
1. Every factual statement has an inline citation with URL
2. All citations use the [Title](URL) format
3. You've cited the actual scraped pages, not just search results
4. Publication dates are mentioned when available

Base your response on the full content from the scraped pages, not just search snippets.
Format your responses in a clear and helpful manner with comprehensive information.`,
    tools: {
      searchWeb: {
        parameters: z.object({
          query: z.string().describe("The query to search the web for"),
        }),
        execute: async ({ query }, { abortSignal }) => {
          const results = await searchSerper(
            { q: query, num: env.SEARCH_RESULTS_COUNT },
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
    onFinish: opts.onFinish,
    experimental_telemetry: opts.telemetry,
  });
};

export async function askDeepSearch(messages: Message[], model?: LanguageModel) {
  const result = await streamFromDeepSearch({
    messages,
    model,
    onFinish: () => {},
    telemetry: {
      isEnabled: false,
    },
  });

  await result.consumeStream();

  return await result.text;
}