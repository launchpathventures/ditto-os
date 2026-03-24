import { SetupWizard } from "./setup-wizard";
import { detectAvailableClis } from "./actions";

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
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <SetupWizard detectedClis={clis} />
      </div>
    </main>
  );
}
