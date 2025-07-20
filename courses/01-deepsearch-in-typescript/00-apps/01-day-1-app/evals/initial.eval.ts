import { evalite } from "evalite";
import { askDeepSearch } from "~/deep-search";
import type { Message } from "ai";
import { Levenshtein } from 'autoevals';
import { localModel } from "~/model-local";

evalite("Deep Search Eval", {
  data: async (): Promise<{ input: Message[] }[]> => {
    return [
      {
        input: [
          {
            id: "1",
            role: "user",
            content: "What is the latest version of TypeScript?",
          },
        ],
      },
      {
        input: [
          {
            id: "2",
            role: "user",
            content: "What are the main features of Next.js 15?",
          },
        ],
      },
      {
        input: [
          {
            id: "3",
            role: "user",
            content: "What are the latest developments in AI and machine learning in July 2025?",
          },
        ],
      },
    ];
  },
  task: async (input) => {
    return askDeepSearch(input, localModel);
  },
  scorers: [
    {
      name: "Contains Links",
      description:
        "Checks if the output contains any markdown links.",
      scorer: ({ output }) => {
        const containsLinks = /\[([^\]]+)\]\(([^)]+)\)/.test(output);

        return containsLinks ? 1 : 0;
      },
    },
    {
      name: "Citation Density",
      description:
        "Measures the density of citations relative to sentences.",
      scorer: ({ output }) => {
        const linkCount = (output.match(/\[([^\]]+)\]\(([^)]+)\)/g) || []).length;
        const sentenceCount = (output.match(/[.!?]+/g) || []).length || 1;
        const density = linkCount / sentenceCount;
        
        // Score based on density: aim for at least 0.5 citations per sentence
        if (density >= 0.5) return 1;
        if (density >= 0.3) return 0.7;
        if (density >= 0.1) return 0.4;
        return 0.2;
      },
    },
    {
      name: "Citation Format Quality",
      description:
        "Checks if citations follow proper markdown format with descriptive text.",
      scorer: ({ output }) => {
        const links = output.match(/\[([^\]]+)\]\(([^)]+)\)/g) || [];
        if (links.length === 0) return 0;
        
        let validLinks = 0;
        for (const link of links) {
          // Check if link has descriptive text (not just "here" or "link")
          const linkText = link.match(/\[([^\]]+)\]/)?.[1] || "";
          const url = link.match(/\(([^)]+)\)/)?.[1] || "";
          
          if (linkText.length > 4 && 
              !linkText.toLowerCase().match(/^(here|link|this|click)$/i) &&
              url.startsWith("http")) {
            validLinks++;
          }
        }
        
        return validLinks / links.length;
      },
    },
    {
      name: "Source Diversity",
      description:
        "Measures diversity of citation sources (different domains).",
      scorer: ({ output }) => {
        const urls = output.match(/\(https?:\/\/([^/)]+)[^)]*\)/g) || [];
        if (urls.length === 0) return 0;
        
        const domains = new Set(
          urls.map(url => {
            const match = url.match(/https?:\/\/([^/)]+)/);
            return match ? match[1].replace(/^www\./, "") : "";
          })
        );
        
        // Score based on unique domains: 5+ domains = 1.0
        const uniqueDomains = domains.size;
        if (uniqueDomains >= 5) return 1;
        if (uniqueDomains >= 4) return 0.8;
        if (uniqueDomains >= 3) return 0.6;
        if (uniqueDomains >= 2) return 0.4;
        return 0.2;
      },
    },
  ],
});