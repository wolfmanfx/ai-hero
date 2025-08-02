import type { Action } from "../get-next-action";

export interface SearchSource {
  title: string;
  url: string;
  snippet: string;
  favicon?: string;
}

export type OurMessageAnnotation = 
  | {
      type: "NEW_ACTION";
      action: Action;
    }
  | {
      type: "QUERY_PLAN";
      plan: string;
      queries: Array<{
        query: string;
        purpose: string;
      }>;
    }
  | {
      type: "SEARCH_SOURCES";
      sources: SearchSource[];
    }
  | {
      type: "TOKEN_USAGE";
      totalTokens: number;
    };