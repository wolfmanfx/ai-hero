import { generateObject } from "ai";
import { z } from "zod";
import { model } from "~/model";
import type { SystemContext } from "./system-context";

export interface ContinueAction {
  type: "continue";
  reasoning: string;
}

export interface AnswerAction {
  type: "answer";
  reasoning: string;
}

export type Action =
  | ContinueAction
  | AnswerAction;

export const actionSchema = z.object({
  reasoning: z
    .string()
    .describe("The reason you chose this action."),
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
    system: `You are a decision-making component that determines whether to continue searching for information or to generate an answer.

Today's date is ${currentDate} (UTC).${locationInfo ? '\n' + locationInfo : ''}

You must decide what action to take next:

1. 'continue': More information is needed to answer the user's question adequately.
2. 'answer': Sufficient information has been gathered from previous searches to provide a comprehensive answer.

CRITICAL DECISION RULES:
- Choose 'continue' if:
  - No searches have been performed yet for the current question
  - The gathered information is incomplete or contradictory
  - Key aspects of the user's question remain unanswered
  - The search results suggest there might be more relevant information available
  
- Choose 'answer' if:
  - You have gathered comprehensive information from searches
  - All key aspects of the user's question can be addressed
  - The search results provide consistent and sufficient information
  - Further searching is unlikely to add significant value

Base your decision ONLY on the current question and the search results gathered for it.`,
    prompt: `=== PREVIOUS CONVERSATION (for context only) ===
${context.getConversationHistory()}

=== CURRENT QUESTION TO ANSWER ===
"${context.getUserQuestion()}"

=== SEARCH RESULTS FOR CURRENT QUESTION ===
${context.getSearchHistory() || 'No searches performed yet for this question'}

Based on the search results above, decide whether to continue searching or if you have enough information to answer the question.`,
  });

  return result.object;
};