import { type StreamTextResult, streamText, type Message } from "ai";
import { SystemContext } from "./system-context";
import { getNextAction } from "./get-next-action";
import { queryRewriter } from "./query-rewriter";
import { searchSerper } from "~/serper";
import { bulkCrawlWebsites } from "~/crawler";
import { env } from "~/env";
import { answerQuestion } from "./answer-question";
import type { OurMessageAnnotation } from "./types/message-annotation";
import { summarizeURL } from "./summarize-url";

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
    // Step 1: Run the query rewriter
    const queryPlan = await queryRewriter(ctx, opts.langfuseTraceId);
    
    // Send query plan annotation
    opts.writeMessageAnnotation({
      type: "QUERY_PLAN",
      plan: queryPlan.plan,
      queries: queryPlan.queries,
    });
    
    // Step 2: Search based on the queries
    const searchPromises = queryPlan.queries.map(async ({ query }) => {
      const searchResults = await searchWeb(query);
      
      // Extract URLs from search results
      const urls = searchResults.map(result => result.link);
      
      // Scrape all URLs automatically
      const scrapeResults = await scrapeUrls(urls);
      
      // Summarize scraped content in parallel
      const summaryPromises = searchResults.map(async (searchResult) => {
        const scrapeResult = scrapeResults.results?.find(r => r.url === searchResult.link);
        
        if (scrapeResult?.success && scrapeResult?.content) {
          try {
            const summary = await summarizeURL({
              conversationHistory: ctx.getSearchHistory(),
              scrapedContent: scrapeResult.content,
              metadata: {
                title: searchResult.title,
                url: searchResult.link,
                snippet: searchResult.snippet,
                date: searchResult.date,
              },
              query: query,
              langfuseTraceId: opts.langfuseTraceId,
            });
            
            return {
              date: searchResult.date || new Date().toISOString(),
              title: searchResult.title,
              url: searchResult.link,
              snippet: searchResult.snippet,
              scrapedContent: summary,
            };
          } catch (error: any) {
            console.error(`Failed to summarize ${searchResult.link}:`, error);
            
            let errorMessage = "Failed to summarize content";
            
            // Check if it's a 503 overload error
            if (error.statusCode === 503 && error.data?.error?.message?.includes('overloaded')) {
              errorMessage = "Summarizer temporarily overloaded - using snippet only";
              console.warn(`Model overloaded for ${searchResult.link}, falling back to snippet`);
            } else if (error.statusCode) {
              errorMessage = `Summarization failed (Error ${error.statusCode})`;
            }
            
            // Return the search result with snippet as fallback
            return {
              date: searchResult.date || new Date().toISOString(),
              title: searchResult.title,
              url: searchResult.link,
              snippet: searchResult.snippet,
              scrapedContent: `${errorMessage}\n\nSnippet: ${searchResult.snippet}`,
            };
          }
        } else {
          const scrapeError = !scrapeResult?.success ? "Failed to scrape" : "No content found";
          return {
            date: searchResult.date || new Date().toISOString(),
            title: searchResult.title,
            url: searchResult.link,
            snippet: searchResult.snippet,
            scrapedContent: `${scrapeError}\n\nSnippet: ${searchResult.snippet}`,
          };
        }
      });
      
      const combinedResults = await Promise.all(summaryPromises);
      
      return { query, results: combinedResults };
    });
    
    // Wait for all searches to complete
    const allSearchResults = await Promise.all(searchPromises);
    
    // Step 3: Save it to the context
    allSearchResults.forEach(({ query, results }) => {
      ctx.reportSearch({ query, results });
    });
    
    // Step 4: Decide whether to continue by calling getNextAction
    const nextAction = await getNextAction(ctx, opts.langfuseTraceId);
    
    // Send action annotation
    opts.writeMessageAnnotation({
      type: "NEW_ACTION",
      action: nextAction,
    });
    
    if (nextAction.type === "answer") {
      return answerQuestion(ctx, { 
        isFinal: false,
        onFinish: opts.onFinish,
        langfuseTraceId: opts.langfuseTraceId
      });
    }
    // If type is "continue", the loop will continue to the next iteration
    
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