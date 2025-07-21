import { smoothStream, streamText, type StreamTextResult } from "ai";
import { model } from "~/model";
import type { SystemContext } from "./system-context";

export function answerQuestion(
  context: SystemContext,
  options: { 
    isFinal: boolean;
    onFinish?: Parameters<typeof streamText>[0]["onFinish"];
    langfuseTraceId?: string;
  }
): StreamTextResult<{}, string> {
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

  const finalWarning = options.isFinal 
    ? "\n\nIMPORTANT: We may not have all the information needed to answer the question perfectly, but please provide your best effort answer based on the available information."
    : "";

  return streamText({
    model,
    onFinish: options.onFinish,
    experimental_telemetry: options.langfuseTraceId ? {
      isEnabled: true,
      functionId: "answer-question",
      metadata: {
        langfuseTraceId: options.langfuseTraceId,
      },
    } : undefined,
    experimental_transform: [
      smoothStream({
        delayInMs: 20,
        chunking: "line",
      }),
      // markdownJoinerTransform(),
    ],
    system: `You are a helpful AI assistant that provides comprehensive answers based on web search results and scraped content.

Today's date is ${currentDate} (UTC).${locationInfo ? '\n' + locationInfo : ''}

IMPORTANT: When the user asks for location-based information (like "near me", "nearby", "in my area"), use their location data to provide relevant results. If the user's location is not available, ask them to specify their location.

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

Base your response on the full content from the scraped pages and search results provided. Format your response in a clear and helpful manner with comprehensive information.${finalWarning}`,
    prompt: `Conversation history:
${context.getConversationHistory()}

Current question: "${context.getUserQuestion()}"

Search History:
${context.getQueryHistory()}

Scraped Content:
${context.getScrapeHistory()}

Please provide a comprehensive answer to the user's question based on the information above and the conversation context. Remember to cite every fact with inline links.`,
  });
}