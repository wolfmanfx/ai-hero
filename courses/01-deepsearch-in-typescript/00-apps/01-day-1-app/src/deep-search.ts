import {
  streamText,
  type Message,
  type TelemetrySettings,
  type LanguageModel,
  type StreamTextResult,
  type DataStreamWriter,
} from "ai";
import { runAgentLoop } from "./run-agent-loop";
import type { OurMessageAnnotation } from "./types/message-annotation";

export const streamFromDeepSearch = async (opts: {
  messages: Message[];
  onFinish: Parameters<typeof streamText>[0]["onFinish"];
  telemetry: TelemetrySettings;
  model?: LanguageModel;
  dataStream?: DataStreamWriter;
  onAnnotation?: (annotation: OurMessageAnnotation) => void;
  requestHints?: {
    latitude?: string;
    longitude?: string;
    city?: string;
    country?: string;
  };
}): Promise<StreamTextResult<{}, string>> => {
  // Validate we have messages
  if (!opts.messages || opts.messages.length === 0) {
    throw new Error('No messages provided');
  }

  // Run our agent loop and return the streaming result
  return await runAgentLoop(opts.messages, {
    writeMessageAnnotation: opts.dataStream 
      ? (annotation: OurMessageAnnotation) => {
          opts.dataStream!.writeMessageAnnotation(annotation as unknown as Parameters<DataStreamWriter["writeMessageAnnotation"]>[0]);
          // Also call the custom handler if provided
          opts.onAnnotation?.(annotation);
        }
      : (annotation: OurMessageAnnotation) => {
          // Only call custom handler in test mode
          opts.onAnnotation?.(annotation);
        },
    onFinish: opts.onFinish,
    langfuseTraceId: opts.telemetry.metadata?.langfuseTraceId as string | undefined,
    requestHints: opts.requestHints,
  });
};

export async function askDeepSearch(messages: Message[], model?: LanguageModel) {
  const result = await streamFromDeepSearch({
    messages,
    model,
    onFinish: () => {},
    telemetry: {
      isEnabled: false,
    },
  });

  await result.consumeStream();

  return await result.text;
}