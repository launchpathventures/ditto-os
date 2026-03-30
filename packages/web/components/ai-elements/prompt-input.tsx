"use client";

/**
 * PromptInput — Adopted from AI Elements (Deep Adoption, Brief 061)
 *
 * Capsule-shaped input bar with composable subcomponents:
 * PromptInputProvider, PromptInputTextarea, PromptInputSubmit, PromptInputActions.
 *
 * Structural refactor — no visual changes from Brief 058 version.
 * Composable pattern enables future briefs to add file upload, command palette, etc.
 *
 * Provenance: vercel/ai-elements prompt-input.tsx, adapted for Ditto design tokens.
 */

import {
  createContext,
  useContext,
  useRef,
  useCallback,
  useState,
  type ReactNode,
  type DragEvent,
} from "react";
import { cn } from "@/lib/utils";
import { DotParticles } from "@/app/setup/dot-particles";

// --- Context ---

interface PromptInputContextValue {
  value: string;
  onValueChange: (value: string) => void;
  isLoading: boolean;
  isStreaming: boolean;
  onSubmit: () => void;
  onStop?: () => void;
}

const PromptInputContext = createContext<PromptInputContextValue | null>(null);

function usePromptInputContext() {
  const ctx = useContext(PromptInputContext);
  if (!ctx) throw new Error("PromptInput subcomponent must be used within <PromptInputProvider>");
  return ctx;
}

// --- Composable Subcomponents ---

interface PromptInputProviderProps {
  value: string;
  onValueChange: (value: string) => void;
  isLoading: boolean;
  isStreaming?: boolean;
  onSubmit: () => void;
  onStop?: () => void;
  children: ReactNode;
}

function PromptInputProvider({
  value,
  onValueChange,
  isLoading,
  isStreaming = false,
  onSubmit,
  onStop,
  children,
}: PromptInputProviderProps) {
  return (
    <PromptInputContext.Provider
      value={{ value, onValueChange, isLoading, isStreaming, onSubmit, onStop }}
    >
      {children}
    </PromptInputContext.Provider>
  );
}

function PromptInputTextarea({
  placeholder,
  className,
}: {
  placeholder?: string;
  className?: string;
}) {
  const { value, onValueChange, isLoading, onSubmit } = usePromptInputContext();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // AC8: Input always enabled — Enter always submits (queue handled by conversation)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (value.trim()) {
          onSubmit();
        }
      }
    },
    [value, onSubmit],
  );

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onValueChange(e.target.value);
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.style.height = "auto";
        textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
      }
    },
    [onValueChange],
  );

  // AC8: Placeholder changes during active response
  const activePlaceholder = placeholder ?? (isLoading ? "Add to conversation..." : "Message Ditto...");

  return (
    <textarea
      ref={textareaRef}
      data-testid="chat-input"
      value={value}
      onChange={handleInput}
      onKeyDown={handleKeyDown}
      placeholder={activePlaceholder}
      rows={1}
      className={cn(
        "flex-1 resize-none border-none bg-transparent outline-none",
        "text-base leading-[1.5] text-text-primary placeholder:text-text-muted",
        "min-h-[24px] max-h-[120px]",
        className,
      )}
      style={{ height: "24px" }}
    />
  );
}

function PromptInputSubmit({ className }: { className?: string }) {
  const { value, isLoading, isStreaming, onSubmit, onStop } = usePromptInputContext();
  const hasText = value.trim().length > 0;

  // During streaming: stop (left) + send (right) side by side
  if (isStreaming && onStop) {
    return (
      <div className={cn("flex items-center gap-1 self-end mb-[1px]", className)}>
        <button
          onClick={onStop}
          aria-label="Stop generating"
          data-testid="stop-button"
          className={cn(
            "flex-shrink-0",
            "flex items-center justify-center",
            "h-7 w-7 rounded-full bg-surface-raised border border-border",
            "text-text-secondary",
            "transition-colors duration-100 hover:bg-border hover:text-text-primary",
          )}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
            <rect x="6" y="6" width="12" height="12" rx="1" />
          </svg>
        </button>
        <button
          onClick={onSubmit}
          disabled={!hasText}
          aria-label="Send message"
          data-testid="send-button"
          className={cn(
            "flex-shrink-0",
            "flex items-center justify-center",
            "h-7 w-7 rounded-full",
            hasText
              ? "bg-[var(--vivid)] text-white"
              : "bg-surface-raised border border-border text-text-muted",
            "transition-opacity duration-100",
            hasText && "hover:opacity-90 active:opacity-75",
            "disabled:opacity-40",
          )}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
            <path d="m5 12 7-7 7 7" />
            <path d="M12 19V5" />
          </svg>
        </button>
      </div>
    );
  }

  // Submitted (waiting for stream): show send button for queueing
  // Idle: show send button for immediate send
  const canSend = hasText;

  return (
    <button
      onClick={onSubmit}
      disabled={!canSend}
      aria-label="Send message"
      data-testid="send-button"
      className={cn(
        "flex-shrink-0 self-end mb-[1px]",
        "flex items-center justify-center",
        "h-7 w-7 rounded-full",
        canSend
          ? "bg-[var(--vivid)] text-white"
          : "bg-surface-raised border border-border text-text-muted",
        "transition-opacity duration-100",
        canSend && "hover:opacity-90 active:opacity-75",
        "disabled:opacity-40",
        className,
      )}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-3.5 h-3.5"
      >
        <path d="m5 12 7-7 7 7" />
        <path d="M12 19V5" />
      </svg>
    </button>
  );
}

function PromptInputActions({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {children}
    </div>
  );
}

// --- Backward-Compatible Default Export ---

interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  isLoading: boolean;
  isStreaming?: boolean;
  placeholder?: string;
  onFileDrop?: (files: FileList) => void;
}

/**
 * Default composition — backward-compatible with Brief 058 API.
 * conversation.tsx uses: <PromptInput value={...} onChange={...} onSubmit={...} ... />
 */
export function PromptInput({
  value,
  onChange,
  onSubmit,
  onStop,
  isLoading,
  isStreaming,
  placeholder = "Message Ditto...",
  onFileDrop,
}: PromptInputProps) {
  const [focused, setFocused] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      if (onFileDrop && e.dataTransfer.files.length > 0) {
        onFileDrop(e.dataTransfer.files);
      }
    },
    [onFileDrop],
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  return (
    <PromptInputProvider
      value={value}
      onValueChange={onChange}
      isLoading={isLoading}
      isStreaming={isStreaming}
      onSubmit={onSubmit}
      onStop={onStop}
    >
      <div className="max-w-[720px] mx-auto w-full">
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={cn(
            "flex items-end gap-[10px] rounded-3xl border bg-surface px-4 py-[10px] transition-all duration-150",
            focused
              ? "border-[var(--vivid)] shadow-[0_0_0_3px_rgba(5,150,105,0.1)]"
              : "border-border",
            dragOver && "border-vivid bg-vivid-subtle",
          )}
        >
          <div className="flex-shrink-0 self-end mb-[2px]">
            <DotParticles size={28} />
          </div>
          <PromptInputTextarea placeholder={placeholder} />
          <PromptInputSubmit />
        </div>
      </div>
    </PromptInputProvider>
  );
}

// Named exports for composable usage
export { PromptInputProvider, PromptInputTextarea, PromptInputSubmit, PromptInputActions };
