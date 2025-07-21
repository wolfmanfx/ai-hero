import { eq, and, desc } from "drizzle-orm";
import type { Message } from "ai";
import { db } from ".";
import { chats, messages } from "./schema";
import type { DB } from "./schema";
import type { OurMessageAnnotation } from "~/types/message-annotation";

export const upsertChat = async (opts: {
  userId: string;
  chatId: string;
  title?: string;
  messages: Message[];
  annotations?: OurMessageAnnotation[];
}) => {
  const { userId, chatId, title, messages: chatMessages, annotations } = opts;

  return await db.transaction(async (tx) => {
    const existingChat = await tx
      .select()
      .from(chats)
      .where(eq(chats.id, chatId))
      .limit(1);

    if (existingChat.length > 0) {
      if (existingChat[0]!.userId !== userId) {
        throw new Error("Unauthorized: Chat does not belong to user");
      }

      await tx.delete(messages).where(eq(messages.chatId, chatId));

      await tx
        .update(chats)
        .set({ 
          ...(title !== undefined ? { title } : {}),
          updatedAt: new Date() 
        })
        .where(eq(chats.id, chatId));
    } else {
      await tx.insert(chats).values({
        id: chatId,
        title: title ?? "New Chat",
        userId,
      });
    }

    if (chatMessages.length > 0) {
      const messagesToInsert: DB.NewMessage[] = chatMessages.map((message, index) => {
        // Handle both content and parts format
        let parts: DB.Message["parts"];
        
        if (message.parts) {
          parts = message.parts as unknown as DB.Message["parts"];
        } else if (typeof message.content === 'string') {
          parts = [{ type: 'text', text: message.content }] as unknown as DB.Message["parts"];
        } else {
          parts = [] as unknown as DB.Message["parts"];
        }
        
        // Check if this is the last message (assistant message) and we have annotations
        const isLastMessage = index === chatMessages.length - 1;
        const messageAnnotations = isLastMessage && annotations && annotations.length > 0 
          ? annotations as unknown as DB.Message["annotations"]
          : undefined;
        
        return {
          chatId,
          role: message.role,
          parts,
          order: index,
          annotations: messageAnnotations,
        };
      });

      await tx.insert(messages).values(messagesToInsert);
    }

    return chatId;
  });
};

export const getChat = async (chatId: string, userId: string) => {
  const chatWithMessages = await db
    .select({
      chat: chats,
      message: messages,
    })
    .from(chats)
    .leftJoin(messages, eq(chats.id, messages.chatId))
    .where(and(eq(chats.id, chatId), eq(chats.userId, userId)))
    .orderBy(messages.order);

  if (chatWithMessages.length === 0 || !chatWithMessages[0]?.chat) {
    return null;
  }

  const chat = chatWithMessages[0].chat;
  const chatMessages = chatWithMessages
    .filter((row) => row.message !== null)
    .map((row) => ({
      id: row.message!.id,
      role: row.message!.role as Message["role"],
      content: row.message!.parts as Message["content"],
      annotations: row.message!.annotations as OurMessageAnnotation[] | undefined,
    }));

  return {
    ...chat,
    messages: chatMessages,
  };
};

export const getChats = async (userId: string) => {
  const userChats = await db
    .select()
    .from(chats)
    .where(eq(chats.userId, userId))
    .orderBy(desc(chats.updatedAt));

  return userChats;
};