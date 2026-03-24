"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CONNECTION_OPTIONS, type ConnectionMethod, type DittoConfig } from "@/lib/config-types";
import { saveSetup } from "./actions";

interface SetupWizardProps {
  detectedClis: Record<string, boolean>;
}

export function SetupWizard({ detectedClis }: SetupWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<"connection" | "model" | "apikey" | "saving">("connection");
  const [selectedConnection, setSelectedConnection] = useState<ConnectionMethod | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  const connectionOption = CONNECTION_OPTIONS.find((o) => o.id === selectedConnection);

  async function handleSave() {
    if (!selectedConnection || !selectedModel) return;

    setStep("saving");
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
      router.push("/");
    } else {
      setError(result.error || "Failed to save");
      setStep("model");
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="w-3 h-3 rounded-full bg-accent mx-auto" />
        <h1 className="text-xl font-semibold text-text-primary">Set up Ditto</h1>
        <p className="text-text-secondary text-sm max-w-md mx-auto">
          Choose how Ditto connects to an AI model. You can use your existing
          subscription or an API key.
        </p>
      </div>

      {/* Step 1: Connection method */}
      {step === "connection" && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-text-secondary px-1">
            How would you like to connect?
          </p>

          {CONNECTION_OPTIONS.map((option) => {
            const isCliOption = option.detectCommand != null;
            const cliAvailable = option.detectCommand ? detectedClis[option.detectCommand] : true;
            const isDisabled = isCliOption && !cliAvailable;

            return (
              <button
                key={option.id}
                onClick={() => {
                  if (isDisabled) return;
                  setSelectedConnection(option.id);
                  setSelectedModel(null);
                  setStep("model");
                }}
                disabled={isDisabled}
                className={cn(
                  "w-full text-left rounded-xl border p-4 transition-colors",
                  isDisabled
                    ? "border-border/50 opacity-50 cursor-not-allowed"
                    : "border-border hover:border-accent hover:bg-accent-subtle/50 cursor-pointer",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-text-primary">
                        {option.name}
                      </span>
                      {isCliOption && cliAvailable && (
                        <span className="text-xs bg-positive/10 text-positive px-2 py-0.5 rounded-full">
                          detected
                        </span>
                      )}
                      {isCliOption && !cliAvailable && (
                        <span className="text-xs bg-border text-text-muted px-2 py-0.5 rounded-full">
                          not installed
                        </span>
                      )}
                      {!option.requiresApiKey && !isCliOption && (
                        <span className="text-xs bg-positive/10 text-positive px-2 py-0.5 rounded-full">
                          free
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-text-secondary mt-1">
                      {option.description}
                    </p>
                  </div>
                  {!option.requiresApiKey && (
                    <span className="text-xs text-text-muted whitespace-nowrap mt-1">
                      no key needed
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Step 2: Model selection */}
      {step === "model" && connectionOption && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStep("connection")}
              className="text-sm text-text-secondary hover:text-text-primary"
            >
              &larr; Back
            </button>
            <span className="text-sm text-text-muted">
              {connectionOption.name}
            </span>
          </div>

          {/* API key input (if needed) */}
          {connectionOption.requiresApiKey && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-secondary">
                API key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  selectedConnection === "anthropic"
                    ? "sk-ant-..."
                    : "sk-..."
                }
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-base text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
              />
            </div>
          )}

          {/* Model picker */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-secondary">
              Model
            </label>
            <div className="space-y-2">
              {connectionOption.models.map((model) => (
                <button
                  key={model.id}
                  onClick={() => setSelectedModel(model.id)}
                  className={cn(
                    "w-full text-left rounded-lg border p-3 transition-colors cursor-pointer",
                    selectedModel === model.id
                      ? "border-accent bg-accent-subtle"
                      : "border-border hover:border-accent/50",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-text-primary">
                      {model.name}
                    </span>
                    {model.recommended && (
                      <span className="text-xs text-accent">recommended</span>
                    )}
                  </div>
                  <span className="text-xs text-text-muted">{model.id}</span>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-negative">{error}</p>
          )}

          <Button
            onClick={handleSave}
            disabled={
              !selectedModel ||
              (connectionOption.requiresApiKey && !apiKey.trim())
            }
            className="w-full"
          >
            Start using Ditto
          </Button>
        </div>
      )}

      {/* Saving */}
      {step === "saving" && (
        <div className="text-center py-8">
          <div className="flex items-center justify-center gap-1.5 mb-3">
            <div className="w-1.5 h-1.5 rounded-full bg-accent" style={{ animation: "pulse-dot 1.4s ease-in-out infinite" }} />
            <div className="w-1.5 h-1.5 rounded-full bg-accent" style={{ animation: "pulse-dot 1.4s ease-in-out infinite", animationDelay: "0.2s" }} />
            <div className="w-1.5 h-1.5 rounded-full bg-accent" style={{ animation: "pulse-dot 1.4s ease-in-out infinite", animationDelay: "0.4s" }} />
          </div>
          <p className="text-sm text-text-secondary">Setting up...</p>
        </div>
      )}
    </div>
  );
}
