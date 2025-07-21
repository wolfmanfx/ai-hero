import { type StreamTextResult, streamText, type Message } from "ai";
import { SystemContext } from "./system-context";
import { getNextAction, type Action } from "./get-next-action";
import { searchSerper } from "~/serper";
import { bulkCrawlWebsites } from "~/crawler";
import { env } from "~/env";
import { answerQuestion } from "./answer-question";
import type { OurMessageAnnotation } from "./types/message-annotation";

export async function searchWeb(query: string, abortSignal?: AbortSignal) {
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
}

export async function scrapeUrls(urls: string[]) {
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
}

export async function runAgentLoop(
  messages: Message[],
  opts: {
    writeMessageAnnotation: (annotation: OurMessageAnnotation) => void;
    onFinish?: Parameters<typeof streamText>[0]["onFinish"];
    langfuseTraceId?: string;
    requestHints?: {
      latitude?: string;
      longitude?: string;
      city?: string;
      country?: string;
    };
  }
): Promise<StreamTextResult<{}, string>> {
  const ctx = new SystemContext(messages, opts.requestHints);

  while (!ctx.shouldStop()) {
    const nextAction = await getNextAction(ctx, opts.langfuseTraceId);
    
    // Send annotation immediately
    const annotation: OurMessageAnnotation = {
      type: "NEW_ACTION",
      action: nextAction as Action,
    };
    opts.writeMessageAnnotation(annotation);

    if (nextAction.type === "search" && nextAction.query) {
      const searchResults = await searchWeb(nextAction.query);
      
      ctx.reportQueries([{
        query: nextAction.query,
        results: searchResults.map(result => ({
          date: result.date || "",
          title: result.title,
          url: result.link,
          snippet: result.snippet,
        }))
      }]);
    } else if (nextAction.type === "scrape" && nextAction.urls) {
      const scrapeResults = await scrapeUrls(nextAction.urls);
      
      if (scrapeResults.results) {
        ctx.reportScrapes(
          scrapeResults.results
            .filter(r => r.success && r.content)
            .map(r => ({
              url: r.url,
              result: r.content!,
            }))
        );
      }
    } else if (nextAction.type === "answer") {
      return answerQuestion(ctx, { 
        isFinal: false,
        onFinish: opts.onFinish,
        langfuseTraceId: opts.langfuseTraceId
      });
    }

    ctx.incrementStep();
  }

  // If we've taken 10 actions and still don't have an answer,
  // we ask the LLM to give its best attempt at an answer
  return answerQuestion(ctx, { 
    isFinal: true,
    onFinish: opts.onFinish,
    langfuseTraceId: opts.langfuseTraceId
  });
}