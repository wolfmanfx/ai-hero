import ReactMarkdown, { type Components } from "react-markdown";
import type { Message } from "ai";
import { useState } from "react";
import type { OurMessageAnnotation } from "~/types/message-annotation";

export type MessagePart = NonNullable<Message["parts"]>[number];

interface ChatMessageProps {
  parts?: MessagePart[];
  role: string;
  userName: string;
  annotations?: OurMessageAnnotation[];
}

const components: Components = {
  // Override default elements with custom styling
  p: ({ children }) => <p className="mb-4 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-4 list-disc pl-4">{children}</ul>,
  ol: ({ children }) => <ol className="mb-4 list-decimal pl-4">{children}</ol>,
  li: ({ children }) => <li className="mb-1">{children}</li>,
  code: ({ className, children, ...props }) => (
    <code className={`${className ?? ""}`} {...props}>
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="mb-4 overflow-x-auto rounded-lg bg-gray-700 p-4">
      {children}
    </pre>
  ),
  a: ({ children, ...props }) => (
    <a
      className="text-blue-400 underline"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
};

const Markdown = ({ children }: { children: string }) => {
  return <ReactMarkdown components={components}>{children}</ReactMarkdown>;
};

const renderSearchResult = (result: any) => {
  // Handle array of results
  if (Array.isArray(result)) {
    return (
      <div className="space-y-3">
        {result.map((item, idx) => (
          <div key={idx} className="border-l-2 border-gray-700 pl-3">
            {renderSearchResult(item)}
          </div>
        ))}
      </div>
    );
  }

  // Handle object results with common search result patterns
  if (typeof result === "object" && result !== null) {
    const { title, url, snippet, description, content, link, ...rest } = result;
    
    return (
      <div className="space-y-1">
        {(title || result.name) && (
          <h3 className="text-base font-medium text-blue-400">
            {url || link ? (
              <a href={url || link} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {title || result.name}
              </a>
            ) : (
              title || result.name
            )}
          </h3>
        )}
        {(url || link) && (
          <div className="text-xs text-green-600">{url || link}</div>
        )}
        {(snippet || description || content) && (
          <p className="text-sm text-gray-300 leading-relaxed">
            {snippet || description || content}
          </p>
        )}
        {Object.keys(rest).length > 0 && (
          <div className="mt-2 text-xs text-gray-500">
            {Object.entries(rest).map(([key, value]) => (
              <div key={key}>
                <span className="font-medium">{key}:</span> {String(value)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Fallback for primitive values
  return <div className="text-sm text-gray-300">{String(result)}</div>;
};

const formatToolArgs = (args: any) => {
  if (!args || typeof args !== "object") return null;
  
  const entries = Object.entries(args);
  if (entries.length === 0) return null;
  
  // Special handling for different types of prompt fields
  const promptField = entries.find(([key]) => 
    key.toLowerCase() === 'prompt' || 
    key.toLowerCase() === 'query' || 
    key.toLowerCase() === 'question'
  );
  
  const systemPromptField = entries.find(([key]) => 
    key.toLowerCase() === 'systemprompt' || 
    key.toLowerCase() === 'system_prompt' ||
    key.toLowerCase() === 'system'
  );
  
  const combinedPromptField = entries.find(([key]) => 
    key.toLowerCase() === 'combinedprompt' || 
    key.toLowerCase() === 'combined_prompt' ||
    key.toLowerCase() === 'fullprompt' ||
    key.toLowerCase() === 'full_prompt'
  );
  
  const otherFields = entries.filter(([key]) => {
    const lowerKey = key.toLowerCase();
    return lowerKey !== 'prompt' && 
           lowerKey !== 'query' && 
           lowerKey !== 'question' &&
           lowerKey !== 'systemprompt' &&
           lowerKey !== 'system_prompt' &&
           lowerKey !== 'system' &&
           lowerKey !== 'combinedprompt' &&
           lowerKey !== 'combined_prompt' &&
           lowerKey !== 'fullprompt' &&
           lowerKey !== 'full_prompt';
  });
  
  return (
    <div className="space-y-3">
      {promptField && (
        <div className="space-y-1">
          <div className="text-xs text-gray-500 uppercase tracking-wide">{promptField[0]}</div>
          <div className="text-sm text-gray-100 bg-gray-800 rounded p-3 whitespace-pre-wrap">
            {String(promptField[1])}
          </div>
        </div>
      )}
      
      {systemPromptField && (
        <details className="space-y-1">
          <summary className="cursor-pointer text-xs text-gray-500 uppercase tracking-wide hover:text-gray-400">
            {systemPromptField[0]} (Click to expand)
          </summary>
          <div className="text-sm text-gray-100 bg-gray-800 rounded p-3 whitespace-pre-wrap mt-1">
            {String(systemPromptField[1])}
          </div>
        </details>
      )}
      
      {combinedPromptField && (
        <details className="space-y-1">
          <summary className="cursor-pointer text-xs text-gray-500 uppercase tracking-wide hover:text-gray-400">
            {combinedPromptField[0]} (Click to expand)
          </summary>
          <div className="text-sm text-gray-100 bg-gray-800 rounded p-3 whitespace-pre-wrap mt-1">
            {String(combinedPromptField[1])}
          </div>
        </details>
      )}
      
      {otherFields.length > 0 && (
        <div className="space-y-1">
          {otherFields.map(([key, value]) => (
            <div key={key} className="flex items-start gap-2 text-sm">
              <span className="text-gray-500 min-w-[80px]">{key}:</span>
              <span className="text-gray-300 break-all">
                {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const getToolIcon = (toolName: string) => {
  if (toolName.toLowerCase().includes("search")) {
    return (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  );
};

const renderMessagePart = (part: MessagePart, index: number) => {
  switch (part.type) {
    case "text":
      return <Markdown key={index}>{part.text}</Markdown>;
    
    case "tool-invocation":
      const { toolInvocation } = part;
      const isSearch = toolInvocation.toolName.toLowerCase().includes("search");
      
      return (
        <div key={index} className="my-3 rounded-lg border border-gray-700 bg-gray-900/50 overflow-hidden">
          {/* Tool Header */}
          <div className="bg-gray-800/50 px-4 py-2 border-b border-gray-700">
            <div className="flex items-center gap-2">
              <div className="text-blue-400">
                {getToolIcon(toolInvocation.toolName)}
              </div>
              <span className="font-medium text-sm text-gray-300">
                {toolInvocation.toolName}
              </span>
              {toolInvocation.state === "partial-call" && (
                <span className="ml-auto text-xs text-gray-500 animate-pulse">Calling...</span>
              )}
              {toolInvocation.state === "call" && (
                <span className="ml-auto text-xs text-gray-500">Running</span>
              )}
              {toolInvocation.state === "result" && (
                <span className="ml-auto text-xs text-green-500">Complete</span>
              )}
            </div>
          </div>
          
          {/* Tool Content */}
          <div className="p-4">
            {(toolInvocation.state === "partial-call" || toolInvocation.state === "call") && (
              <div>
                {toolInvocation.args && (
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Parameters</div>
                    {formatToolArgs(toolInvocation.args)}
                  </div>
                )}
                {!toolInvocation.args && (
                  <div className="text-sm text-gray-400 italic">Preparing...</div>
                )}
              </div>
            )}
            
            {toolInvocation.state === "result" && (
              <div>
                {/* Always show args prominently */}
                {toolInvocation.args && (
                  <div className="mb-4">
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Parameters</div>
                    {formatToolArgs(toolInvocation.args)}
                  </div>
                )}
                
                {/* Show results */}
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Results</div>
                {isSearch ? (
                  renderSearchResult(toolInvocation.result)
                ) : (
                  <pre className="overflow-x-auto rounded bg-gray-800 p-3 text-xs">
                    {JSON.stringify(toolInvocation.result, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      );
    
    default:
      return null;
  }
};

const SearchIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const LinkIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
  </svg>
);

export const ReasoningSteps = ({
  annotations,
}: {
  annotations: OurMessageAnnotation[];
}) => {
  const [openStep, setOpenStep] = useState<
    number | null
  >(null);

  if (!annotations || annotations.length === 0) return null;

  return (
    <div className="mb-4 w-full">
      <ul className="space-y-1">
        {annotations.map((annotation, index) => {
          const isOpen = openStep === index;
          return (
            <li key={index} className="relative">
              <button
                type="button"
                onClick={() =>
                  setOpenStep(isOpen ? null : index)
                }
                className={`min-w-34 flex w-full flex-shrink-0 items-center rounded px-2 py-1 text-left text-sm transition-colors ${
                  isOpen
                    ? "bg-gray-700 text-gray-200"
                    : "text-gray-400 hover:bg-gray-800 hover:text-gray-300"
                }`}
              >
                <span
                  className={`z-10 mr-3 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 border-gray-500 text-xs font-bold ${
                    isOpen
                      ? "border-blue-400 text-white"
                      : "bg-gray-800 text-gray-300"
                  }`}
                >
                  {index + 1}
                </span>
                {annotation.action.title}
              </button>
              <div
                className={`${isOpen ? "mt-1" : "hidden"}`}
              >
                {isOpen && (
                  <div className="px-2 py-1">
                    <div className="text-sm italic text-gray-400">
                      <Markdown>
                        {annotation.action.reasoning}
                      </Markdown>
                    </div>
                    {annotation.action.type ===
                      "search" && (
                      <div className="mt-2 flex items-center gap-2 text-sm text-gray-400">
                        <SearchIcon />
                        <span>
                          {annotation.action.query}
                        </span>
                      </div>
                    )}
                    {annotation.action.type ===
                      "scrape" && (
                      <div className="mt-2 flex items-center gap-2 text-sm text-gray-400">
                        <LinkIcon />
                        <span>
                          {annotation.action.urls
                            ?.map(
                              (url) =>
                                new URL(url).hostname,
                            )
                            ?.join(", ")}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export const ChatMessage = ({ parts, role, userName, annotations }: ChatMessageProps) => {
  const isAI = role === "assistant";

  return (
    <div className="mb-6">
      <div
        className={`rounded-lg p-4 ${
          isAI ? "bg-gray-800 text-gray-300" : "bg-gray-900 text-gray-300"
        }`}
      >
        <p className="mb-2 text-sm font-semibold text-gray-400">
          {isAI ? "AI" : userName}
        </p>

        {isAI && annotations && annotations.length > 0 && (
          <ReasoningSteps annotations={annotations} />
        )}

        <div className="prose prose-invert max-w-none">
          {parts?.map((part, index) => renderMessagePart(part, index))}
        </div>
      </div>
    </div>
  );
};
