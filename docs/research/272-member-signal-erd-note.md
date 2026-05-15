# Brief 272 Member Signal ERD and Migration Note

**Date:** 2026-05-14
**Status:** Builder note

## Boundary

Member Signal is the reviewed projection of a person's professional signal. It is not the raw research corpus.

```text
network_users
  -> network_member_signals
       -> network_signal_sources
            -> network_user_kb_documents (optional raw pasted/uploaded/user-provided corpus)
       -> network_signal_claims
            -> network_signal_sources
            -> network_user_kb_facts (optional extracted fact provenance)
       -> network_signal_review_events
            -> network_signal_claims (optional)
```

## Why `network_signal_sources` Exists

`network_user_kb_documents` and `network_user_kb_facts` are the raw evidence and extracted-fact layer. They are good at storing source-backed context, per-fact visibility, and KB retrieval inputs, but they do not model Member Signal review state:

- source intake status such as `queued`, `found`, `limited`, `needs_paste`, or `failed`;
- platform constraints for LinkedIn, X, and Instagram;
- source labels and source types used by claim review chips;
- source-level confidence and access notes;
- the link between a reviewed Member Signal and the subset of sources considered for that signal.

`network_signal_sources` therefore stores normalized source metadata and short review excerpts. It does not become a parallel raw evidence store. Pasted text and uploaded/imported text are persisted into `network_user_kb_documents`, and the signal source row points to that KB document through `kb_document_id`.

## Claim Projection

`network_signal_claims` stores curated claims with:

- section: `knownFor`, `bestIntroducedFor`, `canHelpWith`, `currentFocus`, `openTo`, `notAFitFor`, `proof`, `tasteAndStyle`, `preferredIntroStyle`, or `sourceSummary`;
- provenance: `source_id`, optional `kb_fact_id`, `source_label`, `source_url`, and `evidence_snippet`;
- review controls: `confidence`, `visibility`, and `approval_state`.

Claims inferred from multiple sources are labeled with `source_type = "inference"` and `source_label = "inferred by Ditto"`, with contributing source IDs stored in metadata.

## Feedback and Publication

`network_signal_review_events` records source additions, drafted claims, approvals, edits, visibility changes, hides, and publication actions with `before`/`after` payloads and the wrapper `step_run_id`.

Public profile, share, OG, and PNG surfaces read only claims where:

```text
visibility = public
approval_state in (approved, edited)
```

If no approved public Member Signal claims exist, existing profile-card fields remain the fallback for legacy cards.
