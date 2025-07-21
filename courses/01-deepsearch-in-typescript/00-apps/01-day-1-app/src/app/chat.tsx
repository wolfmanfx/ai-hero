"use client";

import { useChat } from "@ai-sdk/react";
import { Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChatMessage } from "~/components/chat-message";
import { SignInModal } from "~/components/sign-in-modal";
import { isNewChatCreated } from "~/utils/chat";
import type { Message } from "ai";
import { StickToBottom } from "use-stick-to-bottom";
import type { OurMessageAnnotation } from "~/types/message-annotation";
import { useGeolocation } from "~/hooks/use-geolocation";

interface ChatProps {
  userName: string;
  isAuthenticated: boolean;
  chatId: string;
  initialMessages: Message[];
  isNewChat: boolean;
}

export const ChatPage = ({ userName, isAuthenticated, chatId, initialMessages, isNewChat }: ChatProps) => {
  const [showSignInModal, setShowSignInModal] = useState(false);
  const router = useRouter();
  const location = useGeolocation();
  
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    data,
  } = useChat({
    body: {
      chatId,
      isNewChat,
      ...(location.latitude && location.longitude && !location.loading ? {
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
          city: location.city ?? undefined,
          country: location.country ?? undefined,
        }
      } : {}),
    },
    initialMessages,
  });

  const handleSubmitWithAuth = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!isAuthenticated) {
      setShowSignInModal(true);
      return;
    }

    handleSubmit(e);
  };

  useEffect(() => {
    const lastDataItem = data?.[data.length - 1];

    if (isNewChatCreated(lastDataItem)) {
      router.push(`?id=${lastDataItem.chatId}`);
    }
  }, [data, router]);

  return (
    <>
      <div className="flex flex-1 flex-col">
        <StickToBottom
          className="mx-auto overflow-y-auto w-full max-w-[65ch] flex-1 relative [&>div]:scrollbar-thin [&>div]:scrollbar-track-gray-800 [&>div]:scrollbar-thumb-gray-600 [&>div]:hover:scrollbar-thumb-gray-500"
          resize="smooth"
          initial="smooth"
        >
          <StickToBottom.Content 
            className="p-4 flex flex-col"
            role="log"
            aria-label="Chat messages"
          >
            {messages.map((message, index) => {
              return (
                <ChatMessage
                  key={index}
                  parts={message.parts}
                  role={message.role as "user" | "assistant"}
                  userName={userName}
                  annotations={message.annotations as OurMessageAnnotation[] | undefined}
                />
              );
            })}
          </StickToBottom.Content>
        </StickToBottom>

        <div className="border-t border-gray-700">
          <div className="mx-auto max-w-[65ch] px-4 pt-2">
            {location.error && (
              <div className="text-xs text-red-400 mb-2">
                Location error: {location.error}. Location-based searches won't be available.
              </div>
            )}
            {location.loading && (
              <div className="text-xs text-gray-400 mb-2">
                Getting your location...
              </div>
            )}
            {!location.loading && !location.error && location.latitude && location.longitude && (
              <div className="text-xs text-gray-400 mb-2">
                📍 {location.city && location.country 
                  ? `${location.city}, ${location.country}` 
                  : `Lat: ${location.latitude.toFixed(4)}, Lon: ${location.longitude.toFixed(4)}`}
              </div>
            )}
          </div>
          <form onSubmit={handleSubmitWithAuth} className="mx-auto max-w-[65ch] p-4 pt-0">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={handleInputChange}
                placeholder="Say something..."
                autoFocus
                aria-label="Chat input"
                className="flex-1 rounded border border-gray-700 bg-gray-800 p-2 text-gray-200 placeholder-gray-400 focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="rounded bg-gray-700 px-4 py-2 text-white hover:bg-gray-600 focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 disabled:hover:bg-gray-700"
              >
                {isLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Send"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      <SignInModal
        isOpen={showSignInModal}
        onClose={() => setShowSignInModal(false)}
      />
    </>
  );
};
