import { z } from "zod";

const newChatCreatedSchema = z.object({
  type: z.literal("NEW_CHAT_CREATED"),
  chatId: z.string(),
});

export function isNewChatCreated(
  data: unknown,
): data is {
  type: "NEW_CHAT_CREATED";
  chatId: string;
} {
  return newChatCreatedSchema.safeParse(data).success;
}