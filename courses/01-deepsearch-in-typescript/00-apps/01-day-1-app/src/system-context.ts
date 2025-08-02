import type { Message, LanguageModelUsage } from "ai";

type SearchResult = {
  date: string;
  title: string;
  url: string;
  snippet: string;
  scrapedContent: string;
};

type SearchHistoryEntry = {
  query: string;
  results: SearchResult[];
};

type UsageEntry = {
  source: string;
  usage: LanguageModelUsage;
};


export class SystemContext {
  /**
   * The full conversation history
   */
  private messages: Message[];

  /**
   * The current step in the loop
   */
  private step = 0;

  /**
   * The combined history of searches and their scraped content
   */
  private searchHistory: SearchHistoryEntry[] = [];

  /**
   * The most recent feedback from the evaluator
   */
  private latestFeedback?: string;

  /**
   * User's location information
   */
  private requestHints?: {
    latitude?: string;
    longitude?: string;
    city?: string;
    country?: string;
  };

  /**
   * Usage tracking for LLM calls
   */
  private usageLog: UsageEntry[] = [];

  constructor(messages: Message[], requestHints?: {
    latitude?: string;
    longitude?: string;
    city?: string;
    country?: string;
  }) {
    this.messages = messages;
    this.requestHints = requestHints;
  }

  shouldStop() {
    return this.step >= 10;
  }

  incrementStep() {
    this.step++;
  }

  getUserQuestion(): string {
    // Get the last user message from the conversation
    const lastUserMessage = this.messages
      .filter(msg => msg.role === 'user')
      .pop();
    return lastUserMessage?.content || '';
  }

  reportSearch(search: SearchHistoryEntry) {
    this.searchHistory.push(search);
  }

  getSearchHistory(): string {
    return this.searchHistory
      .map((search) =>
        [
          `## Query: "${search.query}"`,
          ...search.results.map((result) =>
            [
              `### ${result.date} - ${result.title}`,
              result.url,
              result.snippet,
              `<summary>`,
              result.scrapedContent,
              `</summary>`,
            ].join("\n\n"),
          ),
        ].join("\n\n"),
      )
      .join("\n\n");
  }

  getConversationHistory(): string {
    // Format message history for the prompt
    return this.messages
      .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join("\n\n");
  }

  getRequestHints() {
    return this.requestHints;
  }

  setLatestFeedback(feedback: string) {
    this.latestFeedback = feedback;
  }

  getLatestFeedback(): string | undefined {
    return this.latestFeedback;
  }

  reportUsage(source: string, usage: LanguageModelUsage) {
    // Only report if usage is valid and has tokens
    if (usage && usage.totalTokens && usage.totalTokens > 0) {
      this.usageLog.push({ source, usage });
    }
  }

  getTotalUsage(): number {
    return this.usageLog.reduce((total, entry) => {
      // Ensure we have valid token counts
      const tokens = entry.usage?.totalTokens || 0;
      return total + (isNaN(tokens) ? 0 : tokens);
    }, 0);
  }

  getUsageLog(): UsageEntry[] {
    return this.usageLog;
  }
}