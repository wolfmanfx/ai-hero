import { generateObject } from "ai";
import { z } from "zod";
import { model } from "~/model";
import type { SystemContext } from "./system-context";

export const queryRewriterSchema = z.object({
  plan: z
    .string()
    .describe("A strategic research plan outlining the logical progression of information needed to answer the question"),
  queries: z
    .array(
      z.object({
        query: z
          .string()
          .describe("A specific search query in natural language"),
        purpose: z
          .string()
          .describe("The specific purpose this query serves in the overall research plan"),
      })
    )
    .min(1)
    .max(5)
    .describe("An array of 1-5 sequential search queries that build upon each other"),
});

export type QueryRewriterResult = z.infer<typeof queryRewriterSchema>;

export const queryRewriter = async (
  context: SystemContext,
  langfuseTraceId?: string,
): Promise<QueryRewriterResult> => {
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
    schema: queryRewriterSchema,
    experimental_telemetry: langfuseTraceId ? {
      isEnabled: true,
      functionId: "query-rewriter",
      metadata: {
        langfuseTraceId: langfuseTraceId,
      },
    } : undefined,
    system: `You are a strategic research planner with expertise in breaking down complex questions into logical search steps. Your primary role is to create a detailed research plan before generating any search queries.

Today's date is ${currentDate} (UTC).${locationInfo ? '\n' + locationInfo : ''}

First, analyze the question thoroughly:
- Break down the core components and key concepts
- Identify any implicit assumptions or context needed
- Consider what foundational knowledge might be required
- Think about potential information gaps that need filling

Then, develop a strategic research plan that:
- Outlines the logical progression of information needed
- Identifies dependencies between different pieces of information
- Considers multiple angles or perspectives that might be relevant
- Anticipates potential dead-ends or areas needing clarification

Finally, translate this plan into a numbered list of 3-5 sequential search queries that:
- Are specific and focused (avoid broad queries that return general information)
- Are written in natural language without Boolean operators (no AND/OR)
- Progress logically from foundational to specific information
- Build upon each other in a meaningful way

IMPORTANT: When users ask for location-based information (like "near me", "nearby", "in my area", "local"), include their location in your search queries. For example, if they ask for "great restaurants near me" and they're in Oxford, UK, search for "great restaurants Oxford UK".

IMPORTANT: When users ask for "latest", "recent", "current", or "up-to-date" information, always include relevant date qualifiers in your search queries (e.g., "2025", "December 2024", "today", etc.) to ensure you find the most recent information.

Remember that initial queries can be exploratory - they help establish baseline information or verify assumptions before proceeding to more targeted searches. Each query should serve a specific purpose in your overall research plan.`,
    prompt: `=== PREVIOUS CONVERSATION (for context only) ===
${context.getConversationHistory()}

=== CURRENT QUESTION TO ANSWER ===
"${context.getUserQuestion()}"

=== PREVIOUS SEARCH RESULTS (if any) ===
${context.getSearchHistory() || 'No searches performed yet'}

=== EVALUATOR FEEDBACK (if any) ===
${context.getLatestFeedback() ? `The evaluator provided this feedback on what information is missing or needs improvement:\n\n${context.getLatestFeedback()}` : 'No previous feedback available.'}

Create a strategic research plan and generate search queries to gather comprehensive information to answer this question. If evaluator feedback is provided, prioritize addressing those specific gaps and recommendations.`,
  });

  // Report usage to context
  context.reportUsage("query-rewriter", result.usage);

  return result.object;
};