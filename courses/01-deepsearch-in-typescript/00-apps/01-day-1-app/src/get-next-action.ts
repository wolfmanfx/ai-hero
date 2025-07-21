import { generateObject } from "ai";
import { z } from "zod";
import { model } from "~/model";
import type { SystemContext } from "./system-context";

export interface SearchAction {
  type: "search";
  title: string;
  reasoning: string;
  query: string;
}

export interface ScrapeAction {
  type: "scrape";
  title: string;
  reasoning: string;
  urls: string[];
}

export interface AnswerAction {
  type: "answer";
  title: string;
  reasoning: string;
}

export type Action =
  | SearchAction
  | ScrapeAction
  | AnswerAction;

export const actionSchema = z.object({
  title: z
    .string()
    .describe(
      "The title of the action, to be displayed in the UI. For search actions, use 'Searching: [topic]' format. For scrape actions, use 'Scraping: [website names]' format. For answer actions, use 'Generating answer'. Examples: 'Searching: GPU benchmarks 2025', 'Scraping: TechRadar, Tom's Hardware', 'Generating answer'",
    ),
  reasoning: z
    .string()
    .describe("The reason you chose this step."),
  type: z
    .enum(["search", "scrape", "answer"])
    .describe(
      `The type of action to take.
      - 'search': Search the web for more information.
      - 'scrape': Scrape a URL.
      - 'answer': Answer the user's question and complete the loop.`,
    ),
  query: z
    .string()
    .describe(
      "The query to search for. Required if type is 'search'.",
    )
    .optional(),
  urls: z
    .array(z.string())
    .describe(
      "The URLs to scrape. Required if type is 'scrape'.",
    )
    .optional(),
});

export const getNextAction = async (
  context: SystemContext,
  langfuseTraceId?: string,
) => {
  const currentDate = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    timeZone: 'UTC'
  });

  const requestHints = context.getRequestHints();
  const locationInfo = requestHints 
    ? `
User's Location:
- City: ${requestHints.city ?? 'Unknown'}
- Country: ${requestHints.country ?? 'Unknown'}
- Latitude: ${requestHints.latitude ?? 'Unknown'}
- Longitude: ${requestHints.longitude ?? 'Unknown'}`
    : '';

  const result = await generateObject({
    model,
    schema: actionSchema,
    experimental_telemetry: langfuseTraceId ? {
      isEnabled: true,
      functionId: "get-next-action",
      metadata: {
        langfuseTraceId: langfuseTraceId,
      },
    } : undefined,
    system: `You are a helpful AI assistant with access to web search capabilities and web scraping.

Today's date is ${currentDate} (UTC).${locationInfo ? '\n' + locationInfo : ''}

IMPORTANT: When users ask for location-based information (like "near me", "nearby", "in my area", "local"), include their location in your search queries. For example, if they ask for "great restaurants near me" and they're in Oxford, UK, search for "great restaurants Oxford UK".

IMPORTANT: When users ask for "latest", "recent", "current", or "up-to-date" information, always include relevant date qualifiers in your search queries (e.g., "2024", "December 2024", "today", etc.) to ensure you find the most recent information.

You must decide what action to take next:

1. 'search': Search the web for more information if you need to find websites or general information
2. 'scrape': Scrape specific URLs if you have found relevant websites that need detailed content extraction
3. 'answer': Answer the user's question if you have sufficient information from previous searches and scrapes

CRITICAL WORKFLOW RULES:
- EACH NEW USER QUESTION requires its own fresh search and scrape process
- Previous conversation history provides context but does NOT replace the need for new searches
- ALWAYS start with a search if you haven't searched for THIS SPECIFIC question yet (check "Context from previous actions in this search")
- ALWAYS scrape URLs after searching to get detailed content (even if search snippets seem sufficient)
- Only choose 'answer' AFTER you have both searched AND scraped relevant URLs FOR THE CURRENT QUESTION
- You MUST scrape at least 2-3 relevant URLs from search results before answering
- If "Context from previous actions in this search" is empty, you MUST start with a search

IMPORTANT for titles:
- For search actions: Use format "Searching: [specific topic]" (e.g., "Searching: RTX 5090 benchmarks")
- For scrape actions: Use format "Scraping: [website names]" (e.g., "Scraping: NVIDIA.com, TechPowerUp")
- For answer actions: Use "Generating answer"

Choose the most appropriate next action. Remember: search → scrape → answer is the required workflow FOR EACH NEW QUESTION.`,
    prompt: `=== PREVIOUS CONVERSATION (for context only) ===
${context.getConversationHistory()}

=== CURRENT QUESTION TO ANSWER ===
"${context.getUserQuestion()}"

=== ACTIONS TAKEN FOR CURRENT QUESTION ===
Search History:
${context.getQueryHistory() || 'No searches performed yet for this question'}

Scrape History:
${context.getScrapeHistory() || 'No scrapes performed yet for this question'}

Remember: You must perform fresh searches and scrapes for the current question, regardless of previous conversation history.`,
  });

  return result.object;
};