# Insight-238: Curate is the Seventh Human Job

**Date:** 2026-05-18
**Trigger:** Dev Architect designing parent Brief 278 (Trust, Privacy, Admin, Observability). The Designer interaction spec (`docs/research/278-trust-privacy-admin-ux.md` §2) recommended adopting a seventh human job, "Curate," and noted it is the *same* recommendation `docs/research/memories-legibility-ux.md` already left as its OQ-1. The Architect must rule on D-Q1; this insight captures the ruling and the cross-surface evidence.
**Layers affected:** L6 Human (the six-jobs taxonomy and the 16 primitives), with reach into L1 Process (a job becoming load-bearing shapes how privacy/provenance processes are decomposed for the user)
**Status:** active — flagged for human ratification; absorb into `docs/human-layer.md` once the human rules

## The Insight

The six human jobs (`docs/human-layer.md`) are **Orient, Review, Define, Delegate, Capture, Decide**. A seventh job has now surfaced independently on three different surfaces, none of which maps cleanly to the six:

> **Curate** — *"Is what Ditto knows about me correct, mine, and revocable?"*

This is a **data-ownership / self-correction** job, distinct from Orient ("what is the state of things?") and Decide ("commit to a change"). Curate is the standing posture of inspecting what the system holds *about you*, correcting it, controlling its visibility, and revoking it — a continuous relationship with one's own data, not a one-time orientation or a discrete decision.

The cross-surface recurrence is the argument, not any single surface:

1. **`docs/research/memories-legibility-ux.md` (OQ-1)** — the memory-legibility surface left "Architect may fold Curate into Orient+Decide rather than expand to seven" as an open question. First independent appearance.
2. **Brief 258 (KB intake / off-network scout)** — per-fact visibility and private-scrub controls are a Curate surface (the KB-shelf row: fact · source · visibility · edit/archive). Second.
3. **Brief 278 (Privacy Center)** — its core question is verbatim the Curate question; it is the job's first *full* realisation (eight sections of inspect / correct / re-scope / revoke). Third.

Three independent surfaces converging on the same missing job is a real taxonomy gap, not a one-off. Folding it into Orient+Decide each time has been the repeated deferral; the deferral is now the defect.

**Architect ruling (Brief 278 D-Q1):** Adopt **Curate** as the seventh human job. The Privacy Center (sub-brief 285) is its first full realisation. The fallback, if the human rejects the taxonomy change, is to treat the Privacy Center as a composition of Orient (what's public vs private) + Decide (change/remove/delete) — but that undersells a job now load-bearing across three surfaces and will keep recurring.

## Implications

- **Taxonomy change with architectural reach.** Designer owns `docs/human-layer.md` (Insight-043), but adding a job touches the six-jobs framework that the Architect and every future brief's "User Experience" section reason against. Therefore: **Architect rules, human ratifies, Documenter records.** This insight is the ruling; it is *flagged for human ratification*, not unilaterally written into `human-layer.md`.
- **No new primitive required.** The recurring companion question ("does Curate need a new ContentBlock — `MemoryBlock` / privacy block?") is resolved *No* (Brief 278 D-Q2): Curate surfaces compose from the existing 22-type union (`RecordBlock` + `KnowledgeCitationBlock` + `ActionBlock` + `InputRequestBlock` + `StatusCardBlock`). A new job does not imply a new primitive — the job is a *posture*, the primitives are unchanged. This keeps the block union stable (engine-primitive discipline, CLAUDE.md).
- **Consistency across surfaces.** Once ratified, memories-legibility, Brief 258 KB visibility, and Brief 278 Privacy Center should all be described as Curate surfaces so the vocabulary is uniform and future briefs' UX sections can name the job directly.
- **Personas reach.** Curate's primary actor on the Privacy Center (the Network member and the pre-consent Discovery Profile subject) is also a `docs/personas.md` gap (Brief 278 §User Experience flags it). The job-taxonomy decision and the persona-coverage decision are related and should be ratified together.

## Where It Should Land

- **`docs/human-layer.md`** — add **Curate** as the seventh human job (definition: *"Is what Ditto knows about me correct, mine, and revocable?"*; posture: continuous self-data inspection/correction/visibility/revocation; primitives: composition of existing blocks, no new primitive). The Documenter performs this edit **only after the human ratifies** (per Brief 278 §After Completion #3 and `dev-documenter` handoff).
- **`docs/research/memories-legibility-ux.md`** — its OQ-1 is now resolved by this insight; the Documenter notes the resolution there.

### Resolution

- **Resolves:** Brief 278 D-Q1 (the Architect ruling above); `docs/research/memories-legibility-ux.md` OQ-1 (the original "Architect may fold Curate into Orient+Decide" question, now answered by adoption); the recurring "does Curate need a new ContentBlock" question across memories-legibility and Brief 278 (resolved *No* via the cross-link to Brief 278 D-Q2).
- **Status path:** `active` (this state) → `absorbed into docs/human-layer.md` once the human ratifies. The Documenter records the ruling in `docs/human-layer.md` and `docs/personas.md` (the "Network audiences" related gap flagged in Brief 278) after ratification.
- **If the human declines adoption:** this insight stays `active` and the fallback in §The Insight (treat Curate surfaces as Orient + Decide composition) applies; the Architect re-evaluates after the next surface (the fourth recurrence) raises the question again.
