import type { Action } from "../get-next-action";

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
    };