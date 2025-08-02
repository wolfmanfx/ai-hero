import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";

export const model = anthropic("claude-3-5-haiku-latest");
export const factualityModel = anthropic("claude-3-5-haiku-latest");
export const summarizerModel = google("gemini-2.0-flash-lite");
