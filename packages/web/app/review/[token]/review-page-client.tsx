"use client";

/**
 * Review Page Client Component (Brief 106 + Brief 221).
 *
 * Renders ContentBlocks via existing block registry. Discriminates
 * runner-dispatch-pause variants (Brief 221 D1) by inspecting the
 * `WorkItemFormBlock` whose `formId === "runner-dispatch-approval"`:
 * when present, surfaces interactive "Run on:" radio + force-cloud
 * toggle + sticky bottom Approve/Reject buttons. Otherwise falls back
 * to the original Brief 106 chat-with-Alex flow.
 */

import { useMemo, useState, useRef, useCallback } from "react";
import { BlockRenderer } from "@/components/blocks/block-registry";
import type { ContentBlock } from "@/lib/engine";

interface ReviewPageData {
  id: string;
  title: string;
  contentBlocks: ContentBlock[];
  userName: string | null;
  status: string;
}

interface ReviewPageClientProps {
  data: ReviewPageData;
  token: string;
}

interface ChatMessage {
  role: "user" | "alex";
  text: string;
}

const RUNNER_DISPATCH_APPROVAL_FORM_ID = "runner-dispatch-approval";

/**
 * Find the runner-dispatch-approval form within the contentBlocks. Returns
 * `null` for non-runner-dispatch pages (chat-with-Alex Brief 106 flow).
 */
function findApprovalForm(blocks: ContentBlock[]): {
  kindOptions: string[];
  defaultKind: string;
  forceCloudInitial: boolean;
} | null {
  for (const block of blocks) {
    if (
      block.type === "work_item_form" &&
      (block as ContentBlock & { formId?: string }).formId ===
        RUNNER_DISPATCH_APPROVAL_FORM_ID
    ) {
      const form = block as ContentBlock & {
        formId?: string;
        fields: Array<{
          name: string;
          options?: string[];
          value?: string | number | boolean;
        }>;
      };
      const kindField = form.fields.find((f) => f.name === "selectedKind");
      const forceCloudField = form.fields.find((f) => f.name === "forceCloud");
      const kindOptions = (kindField?.options as string[] | undefined) ?? [];
      const defaultKind = (kindField?.value as string | undefined) ?? kindOptions[0] ?? "";
      const forceCloudInitial = Boolean(forceCloudField?.value);
      return { kindOptions, defaultKind, forceCloudInitial };
    }
  }
  return null;
}

/**
 * Parse a `kind|label` option string. Falls back to the raw value as both
 * kind and label when no separator is present.
 */
function parseKindOption(option: string): { kind: string; label: string } {
  const i = option.indexOf("|");
  if (i === -1) return { kind: option, label: option };
  return { kind: option.slice(0, i), label: option.slice(i + 1) };
}

export function ReviewPageClient({ data, token }: ReviewPageClientProps) {
  const approvalForm = useMemo(
    () => findApprovalForm(data.contentBlocks),
    [data.contentBlocks],
  );

  // Render the runner-dispatch-approval surface when the form is present.
  if (approvalForm && data.status === "active") {
    return (
      <RunnerDispatchApprovalView
        data={data}
        token={token}
        kindOptions={approvalForm.kindOptions}
        defaultKind={approvalForm.defaultKind}
        forceCloudInitial={approvalForm.forceCloudInitial}
      />
    );
  }

  // Fallback: original Brief 106 chat-with-Alex flow.
  return <ChatWithAlexView data={data} token={token} />;
}

// ============================================================
// Brief 221 — Runner Dispatch Approval View
// ============================================================

// Local-mode kinds (Brief 221 §D8 conflict-guard with force-cloud).
const LOCAL_KIND_PREFIXES = ["local-mac-mini"];

function isLocalKindOption(option: string): boolean {
  const idx = option.indexOf("|");
  const kind = idx === -1 ? option : option.slice(0, idx);
  return LOCAL_KIND_PREFIXES.includes(kind);
}

function RunnerDispatchApprovalView(props: {
  data: ReviewPageData;
  token: string;
  kindOptions: string[];
  defaultKind: string;
  forceCloudInitial: boolean;
}) {
  const { data, token, kindOptions, defaultKind, forceCloudInitial } = props;
  const [selectedKind, setSelectedKind] = useState(defaultKind);
  const [forceCloud, setForceCloud] = useState(forceCloudInitial);

  // Reviewer HIGH #1 — force-cloud + local-kind collision guard. When
  // force-cloud is on, local kinds are disabled (server-side rejects the
  // combo too, defence in depth). When the current selection becomes
  // disabled by toggling force-cloud on, snap back to the first cloud kind.
  function handleForceCloudChange(checked: boolean) {
    setForceCloud(checked);
    if (checked && isLocalKindOption(selectedKind)) {
      const firstCloud = kindOptions.find((o) => !isLocalKindOption(o));
      if (firstCloud) setSelectedKind(firstCloud);
    }
  }
  const [submitting, setSubmitting] = useState<"approve" | "reject" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{
    kind: "approved" | "rejected";
    detail: string;
  } | null>(null);

  // Render the summary block (TextBlock — first content block).
  const summaryBlock = data.contentBlocks.find((b) => b.type === "text");

  async function onApprove() {
    setSubmitting("approve");
    setError(null);
    try {
      const res = await fetch(`/api/v1/review/${token}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedKind, forceCloud }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        dispatchId?: string;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setDone({
        kind: "approved",
        detail: body.dispatchId
          ? `Dispatched (${body.dispatchId.slice(0, 8)}…)`
          : "Approved & dispatching…",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(null);
    }
  }

  async function onReject() {
    setSubmitting("reject");
    setError(null);
    try {
      const res = await fetch(`/api/v1/review/${token}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setDone({ kind: "rejected", detail: "Rejected." });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(null);
    }
  }

  if (done) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="text-xl font-semibold text-text-primary">
          {done.kind === "approved" ? "Approved" : "Rejected"}
        </h1>
        <p className="text-sm text-text-secondary">{done.detail}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-32">
      {/* Scrollable content above the sticky action bar */}
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pb-6 pt-6">
        <h1 className="text-xl font-semibold text-text-primary">
          {data.title}
        </h1>

        {summaryBlock && <BlockRenderer block={summaryBlock} />}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-text-secondary">
            This work will run on:
          </legend>
          <div className="flex flex-col gap-2">
            {kindOptions.map((option) => {
              const { kind, label } = parseKindOption(option);
              const checked = selectedKind === option;
              const disabledByForceCloud =
                forceCloud && isLocalKindOption(option);
              return (
                <label
                  key={option}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-3 ${
                    checked
                      ? "border-vivid bg-vivid-subtle"
                      : "border-border bg-white"
                  } ${disabledByForceCloud ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                  style={{ minHeight: 44 }}
                  aria-disabled={disabledByForceCloud}
                >
                  <input
                    type="radio"
                    name="selectedKind"
                    value={option}
                    checked={checked}
                    disabled={disabledByForceCloud}
                    onChange={() => setSelectedKind(option)}
                  />
                  <span className="text-sm">
                    {label}
                    {disabledByForceCloud && (
                      <span className="ml-2 text-xs text-text-muted">
                        (force cloud is on)
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <label
          className="flex items-center gap-3 rounded-lg border border-border bg-white px-3 py-3"
          style={{ minHeight: 44 }}
        >
          <input
            type="checkbox"
            checked={forceCloud}
            onChange={(e) => handleForceCloudChange(e.target.checked)}
          />
          <span className="text-sm text-text-secondary">
            Force cloud for this approval
          </span>
        </label>

        {error && (
          <div
            data-testid="approval-error"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}
      </div>

      {/* Sticky bottom action bar — always visible on mobile */}
      <div
        data-testid="approval-action-bar"
        className="fixed inset-x-0 bottom-0 border-t border-border bg-white px-4 py-3"
        style={{
          paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
        }}
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-2">
          <button
            type="button"
            onClick={onApprove}
            disabled={submitting !== null}
            className="w-full rounded-lg bg-vivid px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            style={{ minHeight: 44 }}
            data-testid="approve-button"
          >
            {submitting === "approve" ? "Dispatching…" : "Approve & dispatch"}
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={submitting !== null}
            className="w-full rounded-lg border border-border bg-white px-4 py-3 text-sm font-medium disabled:opacity-60"
            style={{ minHeight: 44 }}
            data-testid="reject-button"
          >
            {submitting === "reject" ? "Rejecting…" : "Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Brief 106 — Original chat-with-Alex view (unchanged)
// ============================================================

function ChatWithAlexView(props: { data: ReviewPageData; token: string }) {
  const { data, token } = props;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMessage: ChatMessage = { role: "user", text: text.trim() };
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setIsLoading(true);

      try {
        const res = await fetch(`/api/v1/network/review/${token}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text.trim() }),
        });

        if (res.ok) {
          const { reply } = await res.json();
          setMessages((prev) => [...prev, { role: "alex", text: reply }]);
        }
      } catch {
        // Silent fail — user can retry
      } finally {
        setIsLoading(false);
        inputRef.current?.focus();
      }
    },
    [token, isLoading],
  );

  return (
    <div className="flex flex-col gap-8">
      {/* Prepared for banner */}
      {data.userName && (
        <div className="rounded-lg bg-surface-secondary px-4 py-2 text-sm text-text-secondary">
          Prepared for {data.userName}
        </div>
      )}

      {/* Title */}
      <h1 className="text-2xl font-semibold text-text-primary">{data.title}</h1>

      {/* Content blocks */}
      <div className="flex flex-col gap-4">
        {data.contentBlocks.map((block, i) => (
          <BlockRenderer key={i} block={block} />
        ))}
      </div>

      {/* Chat section */}
      {data.status === "active" && (
        <div className="border-t border-border/50 pt-6">
          <p className="mb-4 text-sm text-text-secondary">
            Questions? Ask Alex below.
          </p>

          {/* Messages */}
          {messages.length > 0 && (
            <div className="mb-4 flex flex-col gap-3">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`rounded-lg px-4 py-2 text-sm ${
                    msg.role === "user"
                      ? "ml-auto max-w-[80%] bg-accent text-white"
                      : "mr-auto max-w-[80%] bg-surface-secondary text-text-primary"
                  }`}
                >
                  {msg.text}
                </div>
              ))}
              {isLoading && (
                <div className="mr-auto max-w-[80%] rounded-lg bg-surface-secondary px-4 py-2 text-sm text-text-secondary">
                  ...
                </div>
              )}
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
            className="flex gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Alex..."
              className="flex-1 rounded-lg border border-border bg-background px-4 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      )}

      {/* Completed state */}
      {data.status === "completed" && (
        <div className="border-t border-border/50 pt-6 text-center text-sm text-text-secondary">
          This review has been completed. Alex has incorporated your feedback.
        </div>
      )}
    </div>
  );
}
