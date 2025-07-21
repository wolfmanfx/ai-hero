import type { Message } from "ai";

type QueryResultSearchResult = {
  date: string;
  title: string;
  url: string;
  snippet: string;
};

type QueryResult = {
  query: string;
  results: QueryResultSearchResult[];
};

type ScrapeResult = {
  url: string;
  result: string;
};

const toQueryResult = (
  query: QueryResultSearchResult,
) =>
  [
    `### ${query.date} - ${query.title}`,
    query.url,
    query.snippet,
  ].join("\n\n");

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
   * The history of all queries searched
   */
  private queryHistory: QueryResult[] = [];

  /**
   * The history of all URLs scraped
   */
  private scrapeHistory: ScrapeResult[] = [];

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

  reportQueries(queries: QueryResult[]) {
    this.queryHistory.push(...queries);
  }

  reportScrapes(scrapes: ScrapeResult[]) {
    this.scrapeHistory.push(...scrapes);
  }

  getQueryHistory(): string {
    return this.queryHistory
      .map((query) =>
        [
          `## Query: "${query.query}"`,
          ...query.results.map(toQueryResult),
        ].join("\n\n"),
      )
      .join("\n\n");
  }

  getScrapeHistory(): string {
    return this.scrapeHistory
      .map((scrape) =>
        [
          `## Scrape: "${scrape.url}"`,
          `<scrape_result>`,
          scrape.result,
          `</scrape_result>`,
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