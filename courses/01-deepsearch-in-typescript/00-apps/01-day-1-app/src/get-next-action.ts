import { generateObject } from "ai";
import { z } from "zod";
import { model } from "~/model";
import type { SystemContext } from "./system-context";

export interface ContinueAction {
  type: "continue";
  reasoning: string;
  feedback: string;
}

export interface AnswerAction {
  type: "answer";
  reasoning: string;
  feedback?: string;
}

export type Action =
  | ContinueAction
  | AnswerAction;

export const actionSchema = z.object({
  reasoning: z
    .string()
    .describe("The reason you chose this action."),
  feedback: z
    .string()
    .optional()
    .describe("Detailed feedback about what information is missing, what has been found, or what gaps need to be filled. This should be actionable guidance for the next search iteration. Only required when choosing 'continue'."),
  type: z
    .enum(["continue", "answer"])
    .describe(
      `The type of action to take.
      - 'continue': Continue searching for more information.
      - 'answer': Answer the user's question and complete the loop.`,
    ),
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
    system: `You are a research query optimizer. Your task is to analyze search results against the original research goal and either decide to answer the question or to search for more information.

Today's date is ${currentDate} (UTC).${locationInfo ? '\n' + locationInfo : ''}

PROCESS:
1. Identify ALL information explicitly requested in the original research goal
2. Analyze what specific information has been successfully retrieved in the search results
3. Identify ALL information gaps between what was requested and what was found
4. For entity-specific gaps: Create targeted queries for each missing attribute of identified entities
5. For general knowledge gaps: Create focused queries to find the missing conceptual information

DECISION CRITERIA:
- Choose 'continue' if:
  - No searches have been performed yet for the current question
  - Critical information is missing that would make the answer incomplete or unreliable
  - The search results contain contradictory information that needs clarification
  - Specific entities, dates, numbers, or facts mentioned in the question are unverified
  - The search results suggest there might be more authoritative or recent information available

- Choose 'answer' if:
  - All key components of the user's question have been addressed with reliable information
  - The search results provide consistent, authoritative, and sufficiently detailed information
  - Any remaining gaps are minor and don't affect the core answer
  - Further searching is unlikely to add significant value to the response

FEEDBACK REQUIREMENTS:
- When choosing 'continue': You MUST provide specific, actionable feedback about what information is missing, what contradictions need resolving, or what aspects need deeper investigation. Explain WHY the current information is insufficient and what gaps need to be filled.
- When choosing 'answer': Feedback is optional since you already have sufficient information to answer the question
- Be specific about entities, concepts, or data points that need attention
- Guide the next search iteration with clear direction on what to look for and why

Your feedback should help the query rewriter understand exactly what information is missing and how to search for it more effectively.

Base your decision and feedback ONLY on the current question and the search results gathered for it.`,
    prompt: `=== PREVIOUS CONVERSATION (for context only) ===
${context.getConversationHistory()}

=== CURRENT QUESTION TO ANSWER ===
"${context.getUserQuestion()}"

=== SEARCH RESULTS FOR CURRENT QUESTION ===
${context.getSearchHistory() || 'No searches performed yet for this question'}

Based on the search results above, decide whether to continue searching or if you have enough information to answer the question.`,
  });

  // Report usage to context
  context.reportUsage("get-next-action", result.usage);

  return result.object;
};