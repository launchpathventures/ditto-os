"use client";

/**
 * Process detail page client component.
 * Renders process detail + contextual intelligence right panel.
 */

import { EngineViewProvider } from "@/components/detail/engine-view";
import { ProcessDetailContainer } from "@/components/detail/process-detail";
import { RightPanel } from "@/components/layout/right-panel";
import { PromptInput } from "@/components/self/prompt-input";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

interface ProcessPageProps {
  processId: string;
}

export function ProcessPage({ processId }: ProcessPageProps) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const { status, sendMessage } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { userId: "default" },
    }),
  });

  const isLoading = status === "submitted" || status === "streaming";

  const handleBack = useCallback(() => {
    router.push("/");
  }, [router]);

  const handleChatSubmit = useCallback(() => {
    if (input.trim()) {
      sendMessage({ role: "user", parts: [{ type: "text", text: input }] });
      setInput("");
    }
  }, [input, sendMessage, setInput]);

  return (
    <EngineViewProvider>
      <div className="h-screen flex bg-background">
        {/* Center panel — process detail + chat input */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <ProcessDetailContainer
              processId={processId}
              onBack={handleBack}
            />
          </div>
          <div className="border-t border-border bg-background px-6 py-3">
            <div className="max-w-2xl mx-auto">
              <PromptInput
                value={input}
                onChange={setInput}
                onSubmit={handleChatSubmit}
                isLoading={isLoading}
              />
            </div>
          </div>
        </div>

        {/* Right panel — contextual intelligence for this process */}
        <RightPanel context={{ type: "process", processId }} />
      </div>
    </EngineViewProvider>
  );
}
