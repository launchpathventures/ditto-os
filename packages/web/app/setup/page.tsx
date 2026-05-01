import { SetupWizard } from "./setup-wizard";
import { detectAvailableClis } from "./actions";
import { HeroBackdrop } from "@/components/hero-backdrop";

/**
 * Ditto Setup Page
 *
 * First-run experience. User picks their LLM connection method and model.
 * Subscription paths (Claude CLI, Codex CLI) are presented first.
 * API keys and Ollama as alternatives.
 */

export default async function SetupPage() {
  const clis = await detectAvailableClis();

  return (
    <main className="relative min-h-screen overflow-hidden bg-background flex items-center justify-center p-4">
      <HeroBackdrop variant="architecture" height={480} intensity={0.8} priority />
      <div className="relative z-10 w-full max-w-lg">
        <SetupWizard detectedClis={clis} />
      </div>
    </main>
  );
}
