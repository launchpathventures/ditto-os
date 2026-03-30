"use client";

/**
 * Ditto — Setup Wizard (P23 Prototype Spec)
 *
 * 5 states: scanning → connection → model → API key → success
 * Progress steps, icon-box cards, radio-dot model selection,
 * dot particle canvas, pill-shaped CTAs.
 *
 * Brief 057 AC6-AC8.
 * Provenance: P23 prototype (docs/prototypes/23-setup-connection.html).
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { CONNECTION_OPTIONS, type ConnectionMethod, type DittoConfig } from "@/lib/config-types";
import { saveSetup } from "./actions";
import { DotParticles } from "./dot-particles";

type SetupStep = "scanning" | "connection" | "model" | "apikey" | "success";

interface SetupWizardProps {
  detectedClis: Record<string, boolean>;
}

/** Icons for connection methods */
const CONNECTION_ICONS: Record<ConnectionMethod, React.ReactNode> = {
  "claude-cli": (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
    </svg>
  ),
  "codex-cli": (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
    </svg>
  ),
  "anthropic": (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  ),
  "openai": (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  ),
  "ollama": (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" /><path d="M12 8v8" /><path d="M8 12h8" />
    </svg>
  ),
};

export function SetupWizard({ detectedClis }: SetupWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<SetupStep>("scanning");
  const [selectedConnection, setSelectedConnection] = useState<ConnectionMethod | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  const connectionOption = CONNECTION_OPTIONS.find((o) => o.id === selectedConnection);

  // Scanning state: auto-advance after detection
  useEffect(() => {
    if (step !== "scanning") return;
    const timer = setTimeout(() => setStep("connection"), 1800);
    return () => clearTimeout(timer);
  }, [step]);

  function handleSelectConnection(id: ConnectionMethod) {
    const option = CONNECTION_OPTIONS.find((o) => o.id === id);
    setSelectedConnection(id);
    setSelectedModel(null);
    setApiKey("");
    if (option?.requiresApiKey) {
      setStep("apikey");
    } else {
      setStep("model");
    }
  }

  function handleApiKeySubmit() {
    if (!apiKey.trim()) return;
    setStep("model");
  }

  async function handleSave() {
    if (!selectedConnection || !selectedModel) return;
    if (connectionOption?.requiresApiKey && !apiKey.trim()) return;

    setError(null);

    const config: DittoConfig = {
      connection: selectedConnection,
      model: selectedModel,
    };

    if (connectionOption?.requiresApiKey && apiKey) {
      config.apiKey = apiKey;
    }

    const result = await saveSetup(config);
    if (result.success) {
      setStep("success");
    } else {
      setError(result.error || "Failed to save");
    }
  }

  function handleComplete() {
    router.push("/");
  }

  // Determine progress step state
  const connectDone = step === "model" || step === "success";
  const connectActive = step === "scanning" || step === "connection" || step === "apikey";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-[520px] bg-surface-raised rounded-xl shadow-[var(--shadow-large)] p-10 relative">
        {/* Progress Steps */}
        {step !== "success" && (
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className={cn("flex items-center gap-2 text-[13px] font-medium", connectDone ? "text-positive" : connectActive ? "text-vivid" : "text-text-muted")}>
              <span className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold border-[1.5px]",
                connectDone ? "border-positive bg-positive text-white" : connectActive ? "border-vivid bg-vivid text-white" : "border-border text-text-muted"
              )}>
                {connectDone ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                ) : "1"}
              </span>
              Connect
            </div>
            <div className="w-8 h-px bg-border" />
            <div className={cn("flex items-center gap-2 text-[13px] font-medium", step === "model" ? "text-vivid" : "text-text-muted")}>
              <span className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold border-[1.5px]",
                step === "model" ? "border-vivid bg-vivid text-white" : "border-border text-text-muted"
              )}>
                2
              </span>
              Model
            </div>
          </div>
        )}

        {/* State 1: Scanning */}
        {step === "scanning" && (
          <div className="text-center">
            <DotParticles size={28} className="mx-auto mb-5" />
            <h1 className="text-xl font-semibold text-text-primary mb-2 tracking-[-0.02em]">
              Let&apos;s get you set up
            </h1>
            <p className="text-base text-text-secondary mb-7">
              Ditto needs an AI model to think with. Let me check what you have available.
            </p>
            <div className="bg-surface rounded-lg p-4 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md bg-accent-subtle flex items-center justify-center text-text-primary flex-shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
                </div>
                <div className="text-left">
                  <div className="text-sm font-medium text-text-primary">
                    Looking for connections
                    <span className="inline-flex gap-0.5 ml-0.5">
                      <span className="inline-block" style={{ animation: "pulse-dot 1.4s ease-in-out infinite" }}>.</span>
                      <span className="inline-block" style={{ animation: "pulse-dot 1.4s ease-in-out infinite", animationDelay: "0.2s" }}>.</span>
                      <span className="inline-block" style={{ animation: "pulse-dot 1.4s ease-in-out infinite", animationDelay: "0.4s" }}>.</span>
                    </span>
                  </div>
                  <div className="text-[13px] text-text-muted mt-0.5">Checking for Claude CLI, OpenAI, Ollama</div>
                </div>
              </div>
            </div>
            <button disabled className="w-full py-3 px-6 rounded-full bg-vivid text-white text-base font-medium opacity-45 cursor-not-allowed">
              Continue
            </button>
          </div>
        )}

        {/* State 2: Choose Connection */}
        {step === "connection" && (
          <div>
            <h1 className="text-xl font-semibold text-text-primary text-center mb-2 tracking-[-0.02em]">
              How should Ditto connect?
            </h1>
            <p className="text-base text-text-secondary text-center mb-7">
              Choose how Ditto accesses an AI model. You can change this later.
            </p>
            <div className="flex flex-col gap-2 mb-6">
              {CONNECTION_OPTIONS.map((option) => {
                const isCliOption = option.detectCommand != null;
                const cliDetected = option.detectCommand ? detectedClis[option.detectCommand] : false;
                const isSelected = selectedConnection === option.id;

                return (
                  <button
                    key={option.id}
                    onClick={() => handleSelectConnection(option.id)}
                    className={cn(
                      "flex items-center gap-3.5 p-3.5 bg-background border-[1.5px] rounded-lg cursor-pointer transition-all duration-150",
                      isSelected
                        ? "border-vivid bg-accent-subtle"
                        : "border-border hover:border-border-strong hover:bg-surface",
                    )}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0 text-text-primary",
                      isSelected ? "bg-white" : "bg-surface",
                    )}>
                      {CONNECTION_ICONS[option.id]}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="text-sm font-medium text-text-primary">{option.name}</div>
                      <div className="text-[13px] text-text-muted mt-px">{option.description}</div>
                    </div>
                    {isCliOption && cliDetected && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#EEFAF0] text-positive flex-shrink-0">
                        Detected
                      </span>
                    )}
                    {(!isCliOption || !cliDetected) && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface text-text-muted flex-shrink-0">
                        Available
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* State 3: API Key */}
        {step === "apikey" && connectionOption && (
          <div>
            <h1 className="text-xl font-semibold text-text-primary text-center mb-2 tracking-[-0.02em]">
              Connect with an API key
            </h1>
            <p className="text-base text-text-secondary text-center mb-7">
              Paste your {connectionOption.name === "Anthropic API key" ? "Anthropic" : "OpenAI"} API key below. Ditto stores it locally — it never leaves your machine.
            </p>
            <div className="mb-6">
              <label className="text-sm font-medium text-text-primary mb-1.5 block">
                Your API key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleApiKeySubmit(); }}
                placeholder={selectedConnection === "anthropic" ? "sk-ant-..." : "sk-..."}
                className="w-full px-3.5 py-2.5 text-base border border-border rounded-md bg-background text-text-primary placeholder:text-text-muted outline-none transition-all focus:border-vivid focus:shadow-[0_0_0_3px_rgba(5,150,105,0.08)]"
                autoFocus
              />
            </div>
            <button
              onClick={handleApiKeySubmit}
              disabled={!apiKey.trim()}
              className="w-full py-3 px-6 rounded-full bg-vivid text-white text-base font-medium transition-all hover:bg-vivid-deep hover:shadow-[var(--shadow-subtle)] active:scale-[0.99] disabled:opacity-45 disabled:cursor-not-allowed mb-3"
            >
              Connect &amp; choose model
            </button>
            <button
              onClick={() => { setStep("connection"); setSelectedConnection(null); }}
              className="text-sm font-medium text-text-muted hover:text-text-primary transition-colors flex items-center gap-1"
            >
              ← Back to connections
            </button>
          </div>
        )}

        {/* State 4: Choose Model */}
        {step === "model" && connectionOption && (
          <div>
            <h1 className="text-xl font-semibold text-text-primary text-center mb-2 tracking-[-0.02em]">
              Which model should Ditto use?
            </h1>
            <p className="text-base text-text-secondary text-center mb-7">
              This is the brain Ditto thinks with. You can change it anytime, or let Ditto suggest the best fit as it learns your work.
            </p>
            <div className="flex flex-col gap-1.5 mb-6">
              {connectionOption.models.map((model) => {
                const isSelected = selectedModel === model.id;
                return (
                  <button
                    key={model.id}
                    onClick={() => setSelectedModel(model.id)}
                    className={cn(
                      "flex items-center gap-3 py-3 px-3.5 bg-background border-[1.5px] rounded-md cursor-pointer transition-all duration-150",
                      isSelected
                        ? "border-vivid bg-accent-subtle"
                        : "border-border hover:border-border-strong",
                    )}
                  >
                    {/* Radio dot */}
                    <div className={cn(
                      "w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-150",
                      isSelected ? "border-vivid" : "border-border-strong",
                    )}>
                      <div className={cn(
                        "w-2 h-2 rounded-full bg-vivid transition-opacity duration-150",
                        isSelected ? "opacity-100" : "opacity-0",
                      )} />
                    </div>
                    <span className="text-sm font-medium text-text-primary flex-1 text-left">{model.name}</span>
                    {model.recommended && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-accent-subtle text-text-primary">
                        Recommended
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {error && (
              <p className="text-sm text-negative mb-3">{error}</p>
            )}

            <button
              onClick={handleSave}
              disabled={!selectedModel}
              className="w-full py-3 px-6 rounded-full bg-vivid text-white text-base font-medium transition-all hover:bg-vivid-deep hover:shadow-[var(--shadow-subtle)] active:scale-[0.99] disabled:opacity-45 disabled:cursor-not-allowed mb-3"
            >
              Get started
            </button>
            <button
              onClick={() => {
                if (connectionOption?.requiresApiKey) {
                  setStep("apikey");
                } else {
                  setStep("connection");
                  setSelectedConnection(null);
                }
              }}
              className="text-sm font-medium text-text-muted hover:text-text-primary transition-colors flex items-center gap-1"
            >
              ← Back to connections
            </button>
          </div>
        )}

        {/* State 5: Success */}
        {step === "success" && (
          <div className="text-center">
            <DotParticles size={48} className="mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-text-primary mb-2 tracking-[-0.02em]">
              You&apos;re ready
            </h1>
            <p className="text-base text-text-secondary mb-7">
              Connected to {connectionOption?.models.find((m) => m.id === selectedModel)?.name ?? selectedModel}.
              Now let&apos;s get to know each other — Ditto works best when it understands you and your work.
            </p>
            <button
              onClick={handleComplete}
              className="w-full py-3 px-6 rounded-full bg-vivid text-white text-base font-medium transition-all hover:bg-vivid-deep hover:shadow-[var(--shadow-subtle)] active:scale-[0.99]"
            >
              Let&apos;s go
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
