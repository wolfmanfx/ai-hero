import { type StreamTextResult, streamText, type Message } from "ai";
import { SystemContext } from "./system-context";
import { getNextAction, type Action } from "./get-next-action";
import { queryRewriter } from "./query-rewriter";
import { searchSerper } from "~/serper";
import { bulkCrawlWebsites } from "~/crawler";
import { env } from "~/env";
import { answerQuestion } from "./answer-question";
import type { OurMessageAnnotation, SearchSource } from "./types/message-annotation";
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
      
      return { query, searchResults };
    });
    
    // Wait for all Google searches to complete
    const allGoogleSearches = await Promise.all(searchPromises);
    
    // Collect all unique sources immediately after Google searches complete
    const allSources: SearchSource[] = [];
    const seenUrls = new Set<string>();
    
    for (const { searchResults } of allGoogleSearches) {
      for (const result of searchResults) {
        if (!seenUrls.has(result.link)) {
          seenUrls.add(result.link);
          
          // Extract favicon URL from the domain
          try {
            const url = new URL(result.link);
            const faviconUrl = `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=64`;
            
            allSources.push({
              title: result.title,
              url: result.link,
              snippet: result.snippet,
              favicon: faviconUrl,
            });
          } catch {
            // If URL parsing fails, still add the source without favicon
            allSources.push({
              title: result.title,
              url: result.link,
              snippet: result.snippet,
            });
          }
        }
      }
    }
    
    // Send sources annotation immediately after Google searches complete
    if (allSources.length > 0) {
      opts.writeMessageAnnotation({
        type: "SEARCH_SOURCES",
        sources: allSources,
      });
    }
    
    // Step 3: Scrape and summarize
    const summaryPromises = allGoogleSearches.map(async ({ query, searchResults }) => {
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
              context: ctx,
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
            
            // Check if it's an overload error (multiple ways to detect this)
            const isOverloadError = error.statusCode === 503 || 
                                  error.data?.error?.message?.includes('overloaded') ||
                                  error.message?.includes('overloaded') ||
                                  error.toString().includes('overloaded');
            
            if (isOverloadError && scrapeResult?.content) {
              console.warn(`Model overloaded for ${searchResult.link}, using full scraped content instead`);
              
              // Use the full scraped content instead of snippet when model is overloaded
              return {
                date: searchResult.date || new Date().toISOString(),
                title: searchResult.title,
                url: searchResult.link,
                snippet: searchResult.snippet,
                scrapedContent: `Summarizer temporarily overloaded - using full content:\n\n${scrapeResult.content}`,
              };
            } else {
              let errorMessage = "Failed to summarize content";
              if (error.statusCode) {
                errorMessage = `Summarization failed (Error ${error.statusCode})`;
              }
              
              // Fallback to snippet for non-overload errors
              return {
                date: searchResult.date || new Date().toISOString(),
                title: searchResult.title,
                url: searchResult.link,
                snippet: searchResult.snippet,
                scrapedContent: `${errorMessage}\n\nSnippet: ${searchResult.snippet}`,
              };
            }
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
    
    // Wait for all summaries to complete
    const allSearchResults = await Promise.all(summaryPromises);
    
    // Step 4: Save it to the context
    allSearchResults.forEach(({ query, results }) => {
      ctx.reportSearch({ query, results });
    });
    
    // Step 5: Decide whether to continue by calling getNextAction
    const nextAction = await getNextAction(ctx, opts.langfuseTraceId);
    
    // Store the feedback in the context for the next iteration (only if provided)
    if (nextAction.feedback) {
      ctx.setLatestFeedback(nextAction.feedback);
    }
    
    // Send action annotation
    opts.writeMessageAnnotation({
      type: "NEW_ACTION",
      action: nextAction as Action,
    });
    
    if (nextAction.type === "answer") {
      // Send token usage annotation before answering
      const totalUsage = ctx.getTotalUsage();
      if (totalUsage > 0) {
        opts.writeMessageAnnotation({
          type: "TOKEN_USAGE",
          totalTokens: totalUsage,
        });
      }
      
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
  
  // Send token usage annotation before final answer
  const totalUsage = ctx.getTotalUsage();
  if (totalUsage > 0) {
    opts.writeMessageAnnotation({
      type: "TOKEN_USAGE",
      totalTokens: totalUsage,
    });
  }
  
  return answerQuestion(ctx, { 
    isFinal: true,
    onFinish: opts.onFinish,
    langfuseTraceId: opts.langfuseTraceId
  });
}