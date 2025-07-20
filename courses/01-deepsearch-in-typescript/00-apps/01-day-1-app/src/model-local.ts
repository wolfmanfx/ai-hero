import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const lmstudio = createOpenAICompatible({
  baseURL: "http://localhost:1234/v1",
  name: "lmstudio"
});

export const localModel = lmstudio("");