import type { Message } from "ai";

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
   * User's location information
   */
  private requestHints?: {
    latitude?: string;
    longitude?: string;
    city?: string;
    country?: string;
  };

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
}