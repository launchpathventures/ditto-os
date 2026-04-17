# Research: Network-Scale RSI — Technical Choices for Signing, Privacy, and Canary Gating

**Date:** 2026-04-17
**Role:** Dev Researcher
**Scope:** Three foundational technical domains for Brief 181 (Network-Scale Recursive Self-Improvement). Presents options neutrally with source references. Does not recommend.
**Feeds:** Brief 181 sub-briefs 182 (privacy), 184 (signing + canary), and any ADR that follows.

---

## Context

Brief 181 proposes a network-scale learning loop: workspace nodes emit allowlisted evidence to the central ditto-network, the network learns and produces signed releases, nodes adopt per trust-tier policies. Three technical domains need ground-truth options:

1. **Release signing + update distribution** — how does a node cryptographically verify a release came from the network, detect tampering, and resist key compromise?
2. **Privacy for evidence aggregation** — what primitives prevent re-identification or inference attacks when many nodes contribute signals?
3. **Canary rollout gating** — what concrete thresholds and metrics determine whether a release progresses from canary → partial → full, or aborts?

### Prior art already in Ditto

- **Brief 091** (`docs/briefs/complete/091-fleet-upgrades.md`) — already ships: rolling update, canary (default), circuit breaker (stop after N consecutive failures, default 2), rollback, upgrade history table, webhook alerting. Patterns from Kubernetes rolling update, Google SRE ch. 8, Michael Nygard "Release It!" (circuit breaker), Richardson "Microservices Patterns" (saga with compensating actions). Ditto's established canary primitive for the managed-workspace fleet.
- **Brief 106** (`docs/briefs/complete/106-bespoke-signed-review-pages.md`) — uses signed tokens (magic-link style) for ephemeral authenticated URLs. Not the same as release manifest signing, but demonstrates Ditto has a signing primitive in place for short-lived tokens.
- **Insight-111** (`docs/insights/111-explicit-implicit-signal-separation.md`) — hard constraint: trust tier computation uses only explicit signals; implicit signals feed only meta-processes. Privacy design for evidence emission must respect this: trust-affecting signals are already high-confidence explicit edits; privacy work focuses on the implicit pattern-aggregate signals that feed the scanner.
- **Insight-156** (`docs/insights/156-compiled-knowledge-layer.md`) — establishes the network-vs-workspace split pattern: "Self-scoped lives on Workspace, person-scoped on the Network." Directly relevant to where evidence and compiled knowledge live in the RSI loop.
- **Insight-180** (`docs/insights/180-spike-test-every-new-api.md`) — any new external service or cryptographic primitive needs a spike test before integration.
- **ADR-018** (`docs/adrs/018-runtime-deployment.md`) — two deployment tracks (managed cloud / self-hosted); ADR-025 adds the central network as a third element. Relevant because self-hosted nodes may not reach the network on typical cadences.
- **ADR-025** (`docs/adrs/025-centralized-network-service.md`) — already defines `/network/feedback` as the evidence channel; new evidence types extend this pattern.

### Reference docs checked

- `docs/landscape.md` — no existing evaluations of TUF, Sigstore, npm provenance, Omaha, Argo Rollouts, Flagger, Kayenta
- `docs/architecture.md` — no references to release signing or differential privacy
- `docs/adrs/` — ADR-018, ADR-025, ADR-030 relevant as context; nothing specifically on signing or privacy
- `docs/insights/` — Insight-111, Insight-180 relevant as constraints
- `docs/research/` — `centralized-network-service-deployment.md` covers hub-and-spoke patterns (Temporal, Inngest, LiveKit, Composio, Nango) but not signing or privacy specifically

---

## Topic 1: Release Signing + Update Distribution

### Option 1A: TUF — The Update Framework

TUF is a specification (not a library) that separates update-repository responsibilities into four roles, each with its own keys: **root** (delegates trust to all other roles, kept offline), **targets** (identifies trusted target files, can delegate to subordinate roles), **snapshot** (lists current version numbers of all targets metadata), **timestamp** (short-lived dated statement on snapshot hash, online key). Threshold signing: each role requires N-of-M distinct signatures.

**How it works:**
1. Ship clients with the root public key baked in.
2. Clients update root (if newer version exists), then timestamp, then snapshot, then targets — in that order.
3. Each step verifies signatures and expiration before trusting the next.
4. Key rotation: the root role signs a new root.json listing a new targets/snapshot/timestamp key; clients walk forward through versioned root files verifying each against the prior.

**Attacks defended:** arbitrary installation, endless data, extraneous dependencies, fast-forward, indefinite freeze, malicious mirrors, mix-and-match, rollback, key compromise (up to threshold), wrong software. Twelve documented attack classes in the spec.

**Source references:**
- Spec: [The Update Framework Specification](https://theupdateframework.github.io/specification/latest/), `specification/tuf-spec.md`
- Go implementation: [`theupdateframework/go-tuf`](https://github.com/theupdateframework/go-tuf)
- Python implementation: [`theupdateframework/python-tuf`](https://github.com/theupdateframework/python-tuf)
- TypeScript implementation: [`theupdateframework/tuf-js`](https://github.com/theupdateframework/tuf-js) (used by npm's provenance system)
- Used in production by: Docker Content Trust (via Notary v1), PyPI (via PEP 458), npm (via `tuf-js` for package provenance metadata), AWS Uptane (automotive)

**Pros (factual):**
- Well-specified; independent academic review since 2010
- Multiple mature language implementations
- Threshold signing + role separation limits blast radius of any single key compromise
- Offline root keys reduce attack surface for the most critical role
- Already integrated into npm's provenance stack, so a Node/TypeScript project has first-class library support

**Cons (factual):**
- Significant operational complexity: four roles, four keypairs, key ceremony procedures, offline storage for root and targets keys
- Metadata overhead: every client update requires fetching four JSON files in order
- Client implementation is non-trivial even with a library — enforcement of the update order, expiration checks, and version monotonicity must be correct
- Consistent snapshots (optional feature) adds further complexity but enables concurrent repository updates

### Option 1B: Sigstore / cosign / Fulcio / Rekor

Sigstore provides keyless signing: developers sign artifacts tied to their OIDC identity (GitHub, Google, etc.) rather than managing private keys. Three components: **Cosign** (CLI that signs artifacts), **Fulcio** (certificate authority issuing short-lived certificates bound to OIDC identity), **Rekor** (append-only transparency log recording all signing events in a tamper-evident ledger).

**How it works:**
1. Signer authenticates to Fulcio via OIDC.
2. Fulcio issues a short-lived (~10 minute) X.509 certificate binding an ephemeral keypair to the OIDC identity.
3. Signer signs the artifact with the ephemeral key.
4. Signature, certificate, and artifact digest recorded in Rekor.
5. Verifiers check: signature is valid, certificate chain traces to Fulcio, Rekor entry exists with matching timestamp.

**Source references:**
- Specification + infrastructure: [sigstore.dev](https://docs.sigstore.dev/)
- Cosign CLI: [`sigstore/cosign`](https://github.com/sigstore/cosign)
- Fulcio: [`sigstore/fulcio`](https://github.com/sigstore/fulcio)
- Rekor: [`sigstore/rekor`](https://github.com/sigstore/rekor)
- JS client library: [`sigstore/sigstore-js`](https://github.com/sigstore/sigstore-js), also used by npm
- Production use: npm package provenance (2023+), PyPI signing pilots, GitHub Actions attestation, Kubernetes SLSA compliance

**Pros (factual):**
- No private keys stored anywhere — signing tied to identity
- Transparency log makes silent signing forgery detectable
- Well-integrated with GitHub Actions (OIDC token exchange automatic)
- Aligns with 2024-2025 EU Cyber Resilience Act supply-chain transparency requirements
- Widely adopted ecosystem

**Cons (factual):**
- Requires reachability to Fulcio + Rekor at signing time (no air-gapped signing)
- Verification also requires Rekor lookup (can be cached, but live check preferred)
- Fulcio is a trusted third party — single compromise of Fulcio's root CA is ecosystem-wide
- OIDC tie means sign-as-service-account rather than sign-as-person in CI, which may not match governance needs
- Short-lived certs complicate long-tail verification of old releases (must trust historical Rekor)

### Option 1C: npm ECDSA Registry Signatures

npm migrated from PGP to ECDSA signatures over package metadata (not tarballs directly — signs the name/version/sha integrity string). Verification uses a published public key; no key rotation protocol in the CLI itself.

**How it works:**
1. Registry signs `${package.name}@${package.version}:${package.dist.integrity}` with ECDSA private key.
2. `npm audit signatures` fetches signature + registry public key, verifies.
3. Integrity field uses SSRI (Subresource Integrity) format, typically SHA-512.

**Source references:**
- SSRI library: [`npm/ssri`](https://github.com/npm/ssri)
- Verification docs: [npmjs.com/verifying-registry-signatures](https://docs.npmjs.com/verifying-registry-signatures/)
- About: [npmjs.com/about-registry-signatures](https://docs.npmjs.com/about-registry-signatures/)

**Pros (factual):**
- Minimal protocol — single signature over metadata string
- Fast verification, no external infra beyond published public key
- SSRI library already available in Node ecosystem

**Cons (factual):**
- No delegation or threshold — single key compromise = full trust breach
- No key rotation path beyond publishing a new key (requires client update)
- Metadata-only signing: the tarball's SHA is signed, but the registry-to-tarball link depends on the registry being honest
- Not designed for delegated release authority

### Option 1D: Omaha Protocol (Chrome Auto-Update)

Omaha is Google's auto-update protocol for Chrome and Google Update. Not a signing system per se — a distribution protocol that handles channels, staged rollout, differential updates, and phoning home. Signing layers underneath (Windows code signing, macOS codesigning).

**How it works:**
1. Client checks in periodically (e.g., every 5 hours) with current version + install metadata.
2. Server responds with "no update" or a version assignment (considering channel, rollout phase, targeting rules).
3. Client downloads signed update, verifies via OS-level code signing, applies.
4. Server-side cohort assignment enables targeted rollback.

**Source references:**
- Omaha server: [`google/omaha`](https://github.com/google/omaha) (Windows)
- Chromium Updater docs: [chromium.org/updater](https://www.chromium.org/developers/design-documents/autoupdate/)
- Protocol reference: [google/omaha-proposals](https://github.com/google/omaha-proposals)

**Pros (factual):**
- Purpose-built for staged rollout + channel routing at scale
- Differential update support (only ship the delta)
- Server-side targeting: ship release to 1% of nodes, widen if clean
- Battle-tested at billions-of-clients scale

**Cons (factual):**
- Protocol designed for an installed-app fleet with a central distribution server — not a self-hosted-mostly ecosystem
- Heavy: hundreds of fields in the protocol, includes metrics reporting entangled with update negotiation
- Signing is delegated to the OS layer, not part of Omaha itself — we'd still need a separate signing primitive

### Option 1E: Debian/APT package signing

Apt uses SHA256 hashes of package index files, which are themselves signed with GPG keys distributed via the archive keyring. Threshold is single-signature; multiple archive keys rotate over time.

**Source references:**
- Debian Secure APT: [wiki.debian.org/SecureApt](https://wiki.debian.org/SecureApt)
- debsigs (per-package GPG signing): [packages.debian.org/debsigs](https://packages.debian.org/debsigs)

**Pros (factual):**
- Simple conceptual model: archive key signs Release file, Release file contains hashes of Packages files
- Well-understood after 20+ years of production use
- Supports mirrors via hash verification

**Cons (factual):**
- Single-signature model; no threshold
- Key rotation requires distributing a new keyring (bootstrap problem on stale installs)
- No transparency log

### Option 1F: in-toto + SLSA provenance attestations

in-toto is a specification for supply-chain integrity metadata — signed attestations about what happened during a build (which inputs, which steps, which outputs). SLSA (Supply-chain Levels for Software Artifacts) builds on in-toto to define graded assurance levels.

**How it works:**
1. Build system produces an in-toto attestation: signed JSON document describing the build inputs, steps, and outputs (with hashes).
2. Consumer verifies attestation signature and optionally checks attestation matches expected build (e.g., "this tarball came from this commit via this workflow").
3. SLSA levels add build-environment requirements on top of attestation (Level 1: provenance exists; Level 2: hosted build service; Level 3: tamper-resistant build; Level 4: two-party review).

**Source references:**
- in-toto spec: [in-toto.io/specs](https://in-toto.io/specs)
- Repo: [`in-toto/in-toto`](https://github.com/in-toto/in-toto) (Python), [`in-toto/go-witness`](https://github.com/in-toto/go-witness) (Go)
- SLSA framework: [slsa.dev](https://slsa.dev)
- npm provenance system uses in-toto attestations signed via Sigstore

**Pros (factual):**
- Describes *what the build did*, not just *that a key was used*
- Composable with 1B (Sigstore) — attestations signed keylessly
- Widely adopted 2023+ (npm, GitHub Actions, PyPI pilots)

**Cons (factual):**
- Attestation is orthogonal to distribution — still needs signing + delivery primitive underneath
- Higher complexity — attestation schema itself is substantial
- Primary benefit (provenance auditability) may not be the primary need for release distribution

### Option 1G: Notary v2 / OCI artifact signing

OCI-native signing specification for container images and arbitrary artifacts stored in OCI registries. Uses the OCI distribution spec's referrers API to associate signatures with artifacts.

**Source references:**
- Repo: [`notaryproject/notation`](https://github.com/notaryproject/notation)
- Spec: [notaryproject.dev/specs](https://notaryproject.dev/specs/)
- OCI distribution-spec referrers API: [opencontainers.org/distribution-spec](https://github.com/opencontainers/distribution-spec)

**Pros (factual):**
- Native integration with OCI registries (GHCR, Docker Hub, ECR)
- Plugin architecture supports multiple signing backends including Sigstore
- Direct fit if releases are distributed as OCI artifacts

**Cons (factual):**
- Assumes OCI artifact format for distribution
- Heavier deployment dependency than a plain-HTTP manifest model

### Option 1H: GitHub release asset attestation (`gh attestation`)

GitHub's native attestation system built on Sigstore. `gh attestation sign` produces a keyless Sigstore attestation tied to the GitHub Actions workflow identity; `gh attestation verify` checks it.

**Source references:**
- Docs: [docs.github.com/en/actions/security-guides/using-artifact-attestations](https://docs.github.com/en/actions/security-guides/using-artifact-attestations-to-establish-provenance-for-builds)
- CLI: [`cli/cli`](https://github.com/cli/cli) (ships `gh attestation` subcommand)

**Pros (factual):**
- Zero key management for teams already on GitHub Actions
- Attestation tied to workflow identity (audit trail via GitHub)
- Free for public repos, part of enterprise for private

**Cons (factual):**
- GitHub-specific — vendor lock-in
- Live Sigstore/GitHub dependency for verification
- Not suitable for fully air-gapped deployments

### Option 1I: Roll your own (Ed25519 + manifest)

A minimal custom protocol: generate an Ed25519 keypair, sign release manifests (JSON document listing content hashes + version + timestamp), clients verify. Key rotation handled by publishing the new public key from a manifest signed by the old key (trust-on-first-use for the initial key).

**Pros (factual):**
- Smallest possible surface — one signature verification per pull
- Full control over manifest shape
- Minimal dependencies (`@noble/ed25519` or Node `crypto` stdlib)

**Cons (factual):**
- No prior art, no independent review
- No delegation, threshold, or role separation — single compromise is full compromise
- No transparency log
- No defense against rollback attacks unless explicitly implemented

### Gap

No surveyed option (1A–1I) matches all of the following constraint set simultaneously, if all three apply: TypeScript-ecosystem native library, support for air-gapped signing, single-team operational complexity budget. Each surveyed option satisfies some subset:
- 1A TUF: TypeScript-native (via tuf-js), supports air-gapped signing, high operational complexity
- 1B Sigstore: TypeScript-native (sigstore-js), not air-gapped (requires live Rekor), lower per-sign overhead
- 1C npm ECDSA: TypeScript-native, air-gapped possible, no rotation or delegation primitives
- 1F in-toto / SLSA: orthogonal to distribution — attestation layer that composes with 1B
- 1G Notary v2: OCI-native, assumes OCI distribution
- 1H gh attestation: zero key management, requires GitHub ecosystem
- 1I Ed25519 + manifest: TypeScript-native, air-gapped, no prior art for attack-class defense

Composing multiple options into a hybrid is possible but is a design decision, not a surveyed option. The Architect deciding this brief will choose from the surveyed options or design a composition; the Researcher does not recommend either.

---

## Topic 2: Privacy for Evidence Aggregation

### Option 2A: k-anonymity

A dataset satisfies k-anonymity if every record is indistinguishable from at least k−1 others on quasi-identifier attributes. For evidence aggregation: don't surface or act on a signal unless at least k distinct nodes have reported the same pattern type.

**How it works:**
1. Define quasi-identifier attributes for evidence records (signal type, process id, step id, mode, etc.).
2. Before acting on a pattern, require at least k records in the same equivalence class.
3. Below threshold: the signal is buffered but not actionable.

**Production values observed:**
- HIPAA de-identification research: k=5 commonly cited for low-risk datasets; k=10 and k=20 appear in higher-sensitivity contexts
- HIPAA Safe Harbor population threshold: 20,000 (geographic)
- One research paper cites k=5 for a prosecutor-scenario threshold risk of 0.2; higher k for higher-sensitivity
- No universal recommendation; context-dependent

**Source references:**
- Wikipedia: [en.wikipedia.org/wiki/K-anonymity](https://en.wikipedia.org/wiki/K-anonymity)
- Academic origin: Sweeney, "k-Anonymity: A Model for Protecting Privacy" (2002)
- Data Privacy Handbook: [utrechtuniversity.github.io/dataprivacyhandbook](https://utrechtuniversity.github.io/dataprivacyhandbook/k-l-t-anonymity.html)
- Health-data sharing review: Springer, ["Mastering data privacy: leveraging K-anonymity for robust health data sharing"](https://link.springer.com/article/10.1007/s10207-024-00838-8) (2024)

**Pros (factual):**
- Simple to implement and reason about
- Well-understood in academic + legal literature
- Does not distort individual values (no noise added)

**Cons (factual):**
- Does not protect against attribute disclosure when all k records share a sensitive attribute value (homogeneity attack)
- Does not protect against background-knowledge attacks (attacker knows specific user contributes)
- Utility loss increases with k — higher k = fewer actionable signals

### Option 2B: l-diversity

Extends k-anonymity by requiring each equivalence class to contain at least l "well-represented" values for each sensitive attribute. Addresses homogeneity attacks.

**Source references:**
- Machanavajjhala et al., "l-Diversity: Privacy Beyond k-Anonymity" (2006)
- Survey: [PDF, IJIRST](http://www.ijirst.org/articles/IJIRSTV6I6015.pdf)

**Pros (factual):** addresses homogeneity-attack weakness of k-anonymity.
**Cons (factual):** more complex to enforce; "well-represented" has multiple definitions (distinct, entropy, recursive); doesn't address skewness or similarity attacks.

### Option 2C: t-closeness

Extends l-diversity by requiring the distribution of a sensitive attribute within any equivalence class to be close (within threshold t) to the overall distribution. Addresses skewness and similarity attacks.

**Source references:**
- Li et al., "t-Closeness: Privacy Beyond k-Anonymity and l-Diversity" (IEEE ICDE 2007): [ieeexplore.ieee.org/document/4221659](https://ieeexplore.ieee.org/document/4221659/)
- Original PDF: [cs.purdue.edu/homes/ninghui/papers/t_closeness_icde07.pdf](https://www.cs.purdue.edu/homes/ninghui/papers/t_closeness_icde07.pdf)

**Pros (factual):** strongest of the three thresholds against attribute-disclosure attacks.
**Cons (factual):** highest utility loss; most complex to enforce; requires choosing a distance metric (Earth Mover's Distance is typical).

### Option 2D: Local Differential Privacy (LDP)

Each node adds noise to its signal before transmission. Central aggregator sees noisy data; noise cancels in aggregate but individual records carry no confident information. Apple and Google's Chrome RAPPOR system are the canonical production deployments.

**How RAPPOR works (Chrome):**
1. Each user has a permanent noisy version of their true value, stored locally for longitudinal consistency.
2. On each report, additional temporary noise added to the permanent noisy value.
3. Prevents collector from averaging out noise across many reports from the same user.

**Epsilon (ε) values observed:**
- Apple: ε = 2 to 8 (reporting implementation)
- Google federated learning: ε = 8.9
- Chrome: 107 metrics at high-privacy (low ε), 28 metrics at low-privacy (high ε)
- US Census Bureau: ε ≈ 19 (higher means lower privacy)
- No universal consensus; selection is subjective

**Source references:**
- RAPPOR paper: Erlingsson, Pihur, Korolova, "RAPPOR: Randomized Aggregatable Privacy-Preserving Ordinal Response" (CCS 2014)
- Apple's Learning with Privacy at Scale: [machinelearning.apple.com/research/learning-with-privacy-at-scale](https://machinelearning.apple.com/research/learning-with-privacy-at-scale)
- DP survey for ML: [arxiv.org/html/2506.11687v2](https://arxiv.org/html/2506.11687v2) (2025)
- Real-world deployment list: [desfontain.es/blog/real-world-differential-privacy.html](https://desfontain.es/blog/real-world-differential-privacy.html)

**Pros (factual):**
- Mathematically rigorous privacy guarantee (for chosen ε)
- Works at any scale including single-user reports
- No quasi-identifier classification needed

**Cons (factual):**
- Significant utility loss at privacy-preserving ε values
- Requires careful protocol design; naive noise breaks properties
- ε choice is subjective and high-impact; Chrome's RAPPOR was ultimately deprecated in favor of different approaches
- Aggregation math is non-trivial — decoding noisy responses requires dedicated infrastructure

### Option 2E: Central Differential Privacy

Raw data arrives centrally; noise added during aggregation. Simpler math than LDP, better utility, but requires trusting the aggregator not to leak raw inputs.

**Source references:** same as Option 2D.

**Pros (factual):** better utility than LDP at equivalent ε; conceptually simpler.
**Cons (factual):** trust model is weaker — central party sees raw contributions; a compromise there is a total leak.

### Option 2F: Shuffle-DP / Anonymous aggregation

A three-party model: clients add small local noise → shuffler strips sender identity and randomizes order → aggregator computes statistics. Shuffling provides an additional privacy amplification so less noise is needed than pure LDP at equivalent ε. Google's Prochlo architecture and recent production work on ESA (Encode, Shuffle, Analyze) use this.

**Source references:**
- Prochlo paper: Bittau et al., "Prochlo: Strong Privacy for Analytics in the Crowd" (SOSP 2017)
- Cheu et al., "Distributed Differential Privacy via Shuffling" (EUROCRYPT 2019)
- ESA deployment notes: [ai.googleblog.com/2019/10/encode-shuffle-analyze](https://ai.googleblog.com/2019/10/encode-shuffle-analyze-privacy-through.html)

**Pros (factual):**
- Better utility than pure LDP at equivalent privacy
- Adopted at production scale by Google for specific telemetry flows
- Works in heterogeneous client environments (mixed trust)

**Cons (factual):**
- Requires trusted shuffler (third party) — compatible with but distinct from the aggregator
- Complex deployment: needs three distinct services with different trust relationships
- Overhead non-trivial for pattern-type aggregate counting

### Option 2G: Secure Aggregation (federated-learning primitive)

Cryptographic protocol where the aggregator learns only the sum (or other linear function) of client contributions — never per-client values — even without a trusted shuffler. Used in Google's federated learning production deployments for Gboard and similar.

**How it works:**
1. Clients enroll in a cohort (N clients per aggregation round).
2. Each client's value is masked with pairwise random keys negotiated with other clients.
3. Masks cancel in the aggregate sum; aggregator sees total, not per-client.
4. Handles client dropout via Shamir secret sharing.

**Source references:**
- Bonawitz et al., "Practical Secure Aggregation for Privacy-Preserving Machine Learning" (CCS 2017)
- TFF (TensorFlow Federated): [`tensorflow/federated`](https://github.com/tensorflow/federated)
- Flower framework: [`adap/flower`](https://github.com/adap/flower)

**Pros (factual):**
- Aggregator never sees per-client values — stronger than central DP trust model
- No privacy budget consumption for statistics that are exactly aggregatable (sums, counts)
- Mature implementations available

**Cons (factual):**
- Protocol complexity: clients communicate pairwise during aggregation
- Requires cohorts of participating clients online simultaneously
- Heavy infrastructure; most value for ML training rather than pattern-type counting
- Does not itself add differential privacy — provides the "trusted aggregator" that central DP assumes

### Option 2H: Allowlist-only typed emission (no privacy primitive)

Instead of adding a privacy primitive, emit only a hard-coded allowlist of typed signal shapes that contain no PII by construction. Example: instead of sending a correction diff, send `{signal: "correction_classification", severity: "moderate", direction: "softer", process_template_id: "tmpl_12", step_index: 3}`. No free text, no identifiers that cross-reference to users.

**How it works:**
1. Define typed evidence shapes in code (TypeScript enums + zod schemas).
2. Node-side emission pipeline accepts only these types; compile-time rejection of anything else.
3. Aggregator on the network treats sub-threshold pattern types as buffered but non-actionable (k-anonymity-lite: k=5 default).

**Pros (factual):**
- Simplest to implement and audit
- PII absence is enforced at the type level, not by runtime sanitization
- No noise, no utility loss
- Directly aligns with Insight-111's explicit-signal-separation constraint

**Cons (factual):**
- Requires careful schema design; any schema mistake can leak (e.g., including a user-provided string)
- No protection against combining multiple non-PII signals into an identifying fingerprint
- Does not protect against a hostile central aggregator with access to payloads
- Requires allowlist discipline across all contributors and reviewers

### Gap

No existing Ditto pattern addresses privacy for cross-node evidence aggregation. Insight-111 forbids implicit signals from trust computation but doesn't constrain what gets shared with the network. Insight-156 specifies the network-vs-workspace split for knowledge and person data but does not specify the learning-signal boundary.

None of options 2A–2G alone enforces privacy at the type level (compile-time); only 2H does. Combining 2H with one of 2A–2G for runtime aggregator-side checks is possible. Federated-learning primitives (2F, 2G) are heavier than the typed-aggregate-counting use case likely needs but become more relevant if the SLM training pipeline (Briefs 135–137) draws on network evidence. The specific composition is a design decision, not a surveyed option.

---

## Topic 3: Canary Rollout Gating

### Option 3A: Brief 091's existing fleet-upgrade pattern (Ditto native)

Ditto already ships this for managed workspace upgrades. Key mechanisms:
- **Canary mode** is default — upgrade one workspace first, wait for deep health check (`/healthz?deep=true`), proceed only on pass.
- **Circuit breaker** stops after N consecutive failures (default 2, configurable).
- **Rollback** is itself a rolling operation with the same circuit breaker.
- **Upgrade history** in dedicated table; per-workspace results recorded.
- **Webhook alerting** on circuit-breaker trip or failure.

**Source references:**
- Brief: `docs/briefs/complete/091-fleet-upgrades.md`
- Referenced patterns: Kubernetes rolling update, Google SRE Book ch. 8, Michael Nygard "Release It!", Richardson "Microservices Patterns" saga pattern

**Pros (factual):**
- Already built, already operating
- Matches Ditto's conventions (saga + circuit breaker)
- Extends naturally to release-manifest adoption

**Cons (factual):**
- Binary health check (pass/fail), not metric-driven gating
- Single canary step (one workspace); no 5% → 25% → 100% progression
- No dwell-time gate between steps — only "wait for health check"
- Designed for binary success/failure of a restart, not for statistical comparison of behavior

### Option 3B: Argo Rollouts progressive delivery

Kubernetes-native controller that implements blue-green, canary, and progressive rollout strategies with configurable analysis steps between traffic increments.

**How it works (canary strategy):**
1. Release manifest defines `steps`: `setWeight: 20 / pause: {duration: 10m} / setWeight: 40 / pause / setWeight: 60 / pause / setWeight: 80 / pause / setWeight: 100`.
2. Between steps, Argo runs `AnalysisTemplates` that query metrics (Prometheus, Datadog, CloudWatch, etc.) and pass/fail based on success criteria.
3. Failure at any step triggers automatic rollback.

**Source references:**
- Repo: [`argoproj/argo-rollouts`](https://github.com/argoproj/argo-rollouts)
- Docs: [argoproj.github.io/argo-rollouts](https://argoproj.github.io/argo-rollouts/)
- AnalysisRun spec: [argo-rollouts/analysis/](https://argoproj.github.io/argo-rollouts/features/analysis/)

**Pros (factual):**
- Explicit stepped progression (configurable percentages and dwell times)
- Metric-driven gating, not just health-check binary
- Automatic rollback on analysis failure
- Mature Kubernetes ecosystem integration

**Cons (factual):**
- Kubernetes-native; assumes pods + services + traffic-routing infrastructure
- Heavy for a system where "rollout" means "nodes pull on their cadence" rather than "traffic splits at load balancer"
- Overkill as a library; more useful as a pattern reference

### Option 3C: Flagger

Progressive delivery controller for Kubernetes and service meshes (Istio, Linkerd, NGINX, Gloo). Similar step model to Argo Rollouts; integrates more deeply with service mesh for traffic management.

**Source references:**
- Repo: [`fluxcd/flagger`](https://github.com/fluxcd/flagger)
- Docs: [docs.flagger.app](https://docs.flagger.app/)

**Pros (factual):** service-mesh integration provides finer traffic routing; automated A/B testing support.
**Cons (factual):** service-mesh requirement; heavy for Ditto's pull-based update model.

### Option 3D: Kayenta (Netflix statistical canary analysis)

Netflix's automated canary analysis service. Judges canary success by statistical comparison of canary vs baseline time-series metrics rather than threshold checks.

**How it works:**
1. Baseline cluster + canary cluster receive same traffic proportion.
2. Metrics (CPU, latency, error rate, custom app metrics) collected from both.
3. Kayenta uses Mann-Whitney U-test or similar to determine if canary is statistically worse than baseline.
4. Pass/fail/inconclusive verdict drives rollout progression.

**Source references:**
- Repo: [`spinnaker/kayenta`](https://github.com/spinnaker/kayenta)
- Netflix tech blog: [netflixtechblog.com/automated-canary-analysis-at-netflix](https://netflixtechblog.com/automated-canary-analysis-at-netflix-with-kayenta-3260bc7acc69)

**Pros (factual):**
- Statistically rigorous — no arbitrary threshold tuning
- Integrates into Spinnaker pipelines
- Handles the "everything looks OK but it's subtly worse" case that threshold-based gating misses

**Cons (factual):**
- Requires both canary and baseline cohort running simultaneously with comparable traffic
- Heavy infrastructure dependency (Spinnaker stack is substantial)
- Metrics must be representative and volume-sufficient for statistical tests

### Option 3E: Chrome release channel staged rollout

Chrome's production model: four channels (Canary, Dev, Beta, Stable). Stable releases ship in staged waves — initial %X of users, observed for Y days, widened if clean.

**Observed patterns (approximate, not officially documented):**
- Canary channel: daily updates, ~0.01% of users (primarily Google internal)
- Dev channel: 1-2 updates per week, ~0.05% of users
- Beta channel: weekly updates, ~1% of users, dwell time ~6 weeks before stable
- Stable channel: staged rollout — 1% → 10% → 50% → 100% over several days with monitoring between

**Source references:**
- Chrome release channels: [chromium.org/getting-involved/chrome-release-channels](https://www.chromium.org/getting-involved/chrome-release-channels/)
- Chrome update cadence: [support.google.com/chrome/a/answer/9027636](https://support.google.com/chrome/a/answer/9027636)

**Pros (factual):**
- Multi-channel model matches node heterogeneity (dogfood / beta users / production)
- Staged percentages within stable channel reduce blast radius without infrastructure overhead
- Battle-tested at billion-user scale

**Cons (factual):**
- Specific percentages and dwell times aren't publicly documented in detail
- Chrome's model assumes centralized targeting; self-hosted nodes would need equivalent server-side cohort assignment
- Chrome's cohorts are client-side by Chrome version; our model would need explicit cohort assignment in release manifest

### Option 3F: Feature flags / runtime gating (OpenFeature, Unleash, LaunchDarkly)

Decouples shipping from activation. Release manifest always ships 100%; new behavior is gated behind a flag that the feature-flag service evaluates per-request or per-node. Gradual rollout = gradually flipping flag-on for larger cohorts. Abort = flip flag off.

**How it works:**
1. Release ships with new code gated by flag `rsi.scanner.v2_enabled`.
2. Feature-flag service evaluates flag per caller (node id, user id, cohort, segment rules).
3. Rollout = progressive audience expansion in the flag config, not in the release pipeline.
4. Kill = single flag flip, no rollback needed.

**Source references:**
- OpenFeature spec (vendor-neutral): [openfeature.dev](https://openfeature.dev), [`open-feature`](https://github.com/open-feature)
- Unleash (OSS): [`Unleash/unleash`](https://github.com/Unleash/unleash)
- LaunchDarkly (commercial): [launchdarkly.com](https://launchdarkly.com)
- Flagsmith (OSS + commercial): [`Flagsmith/flagsmith`](https://github.com/Flagsmith/flagsmith)

**Pros (factual):**
- Decouples "code on disk" from "behavior active" — enables instant kill without redeploy
- Natural fit for "nodes pull on cadence" — code lands earlier than behavior
- Gradual rollout becomes a targeting-rule config change, not a release dance
- Supports A/B testing and progressive audience expansion natively

**Cons (factual):**
- Requires flag-evaluation infrastructure (either SaaS, self-hosted Unleash/Flagsmith, or OpenFeature SDK against a backing store)
- Flag debt: old flags that never get removed become technical sediment
- Feature-flag logic in code is a form of complexity
- Does not replace signed releases — flags sit on top

### Option 3G: Blue-green deployment

Two environments (blue currently live, green containing new release) with instant traffic switch. Rollback = switch back. Typically used for services with a single deployment target, less natural for distributed fleets.

**Source references:**
- Martin Fowler, "BlueGreenDeployment" article (2010)
- [Kubernetes blue-green strategies, Argo Rollouts](https://argoproj.github.io/argo-rollouts/features/bluegreen/)

**Pros (factual):**
- Instant cutover and rollback
- Full environment validation before cutover
- No mixed-version period during rollout

**Cons (factual):**
- Requires duplicate infrastructure during rollout
- Not a natural fit for a pull-based node update model
- Binary cutover — no gradual rollout by construction

### Option 3H: Google SRE book canarying guidance

The Google SRE Workbook chapter "Canarying Releases" establishes principles but doesn't prescribe specific numbers for general use. Key principles:
- Canary populations must be representative of the production population
- Observation window must be long enough for issues to manifest (longer than the longest service latency / typical request duration by some multiple)
- Automated rollback on clear failure signals; human judgment on ambiguous signals
- "Size of the service and risk profile inform the percentages of production capacity for rollouts and the appropriate timeframe between stages"

**Source references:**
- [sre.google/workbook/canarying-releases](https://sre.google/workbook/canarying-releases/)
- [sre.google/sre-book/reliable-product-launches](https://sre.google/sre-book/reliable-product-launches/)
- Related: [Canary analysis lessons from Google and Waze](https://cloud.google.com/blog/products/devops-sre/canary-analysis-lessons-learned-and-best-practices-from-google-and-waze)

**Pros (factual):**
- Authoritative, principled guidance
- Maps to Ditto's existing Brief 091 foundations
- Explicitly context-dependent — doesn't prescribe numbers that may not fit

**Cons (factual):**
- No specific numbers — Architect must choose
- Assumes SRE infrastructure (metrics pipelines, incident response) that Ditto has only partially

### Gap — specific numbers for network-scale release gating

No external source prescribes canary percentages, dwell times, and rollback-rate thresholds that transfer directly to Ditto's "nodes pull on cadence" model (as opposed to traffic-split or installed-fleet-auto-update models). Observed industry practice:
- Canary cohort: Chrome ~1% (staged within stable), Netflix ~5% (Kayenta), general SRE guidance "small fraction" without a number
- Canary dwell: Chrome beta ~6 weeks before stable promotion; SRE principle "enough for issues to manifest" without a number
- Partial cohort: Chrome stable channel steps through ~1% → ~10% → ~50%; Argo Rollouts defaults vary by configuration
- Rollback-rate abort threshold: Argo Rollouts / Flagger defaults around 1–5% depending on metric; no universal recommendation

Brief 181's current draft numbers (canary 5%, canary dwell 3 days, partial 25%, partial dwell 4 days, max rollback rate in stage 5%) sit within the observed ranges. The specific choice of numbers is a design decision for the Architect.

---

## Summary of options by topic

Factual summary. No ranking implied.

### Topic 1: Signing + distribution

| Option | Key mechanism | Primary defenses | Operational artifacts |
|--------|--------------|-----------------|----------------------|
| 1A TUF | Four-role threshold signing with versioned metadata | 12 documented attack classes incl. rollback, freeze, key compromise (up to threshold) | 4 signed JSON files per update cycle; offline root ceremony |
| 1B Sigstore/cosign | Keyless OIDC-bound short-lived certs + transparency log | Identity-tied signing, transparency-log accountability | Fulcio + Rekor live infra; OIDC token exchange |
| 1C npm ECDSA | Single ECDSA signature over metadata string | Tarball integrity via SSRI hash | Single registry public key; no rotation protocol in CLI |
| 1D Omaha | Protocol for staged distribution with client check-in | Server-side targeting; differential updates | Omaha server stack; code signing at OS layer |
| 1E apt/dpkg | GPG-signed Release file; per-package optional signing | Archive-keyring model; mirror substitution defense via hashes | GPG keyring bootstrap problem on stale installs |
| 1F in-toto / SLSA | Signed attestations describing build provenance | Build-input auditability; composable with 1B | Attestation schema + signing primitive underneath |
| 1G Notary v2 | OCI-native signing via referrers API | Registry-stored signatures; plugin for backends incl. Sigstore | OCI registry dependency; artifact format constraint |
| 1H gh attestation | Sigstore attestation tied to GitHub Actions workflow | Zero key management for GitHub users; workflow-identity provenance | GitHub-specific; not air-gapped |
| 1I Ed25519 + manifest | Single Ed25519 signature over JSON manifest | Depends entirely on implementation | Smallest possible surface; no review history |

### Topic 2: Privacy for evidence

| Option | Key mechanism | What it protects | What it does not protect |
|--------|--------------|-----------------|-------------------------|
| 2A k-anonymity | Require ≥k equivalence class before actionable | Individual re-identification on quasi-identifiers | Attribute disclosure when equivalence class is homogeneous |
| 2B l-diversity | Require ≥l sensitive-attribute values per class | Homogeneity attacks | Skewness / similarity attacks |
| 2C t-closeness | Distribution distance bound per equivalence class | Skewness and similarity attacks | Utility tradeoff grows with t |
| 2D Local DP | Noise added per-record at client | Mathematical guarantee at chosen ε | Utility depends on aggregation volume; ε choice subjective |
| 2E Central DP | Noise added at aggregator | Guarantee at chosen ε (utility > LDP) | Trust in aggregator required |
| 2F Shuffle-DP | LDP + trusted shuffler for amplification | Better utility than pure LDP at same ε | Three-party trust model |
| 2G Secure Aggregation | Cryptographic masked summation | Aggregator sees only sums, not per-client | Protocol requires live cohort; does not itself add DP |
| 2H Allowlist + typed emission | Type-level PII enforcement at emission | PII absence by construction | Fingerprint attacks via signal combination if schema permits |

### Topic 3: Canary gating

| Option | Rollout shape | Gating signal | Infrastructure assumption |
|--------|--------------|--------------|--------------------------|
| 3A Brief 091 (Ditto native) | Canary-one-then-full with circuit breaker | Deep health check pass/fail | Managed-workspace fleet + Fly API |
| 3B Argo Rollouts | Configurable % steps with pause between | Metric-driven AnalysisTemplate | Kubernetes + metrics provider |
| 3C Flagger | Configurable % steps with service-mesh traffic split | Metric-driven (Prometheus etc.) | Kubernetes + service mesh |
| 3D Kayenta | Statistical canary vs baseline comparison | Mann-Whitney U-test or similar on time series | Spinnaker pipelines + two clusters |
| 3E Chrome channel model | Multi-channel (Canary/Dev/Beta/Stable) + in-channel staged % | Production error signals, crash rates | Omaha protocol or equivalent server-side cohorting |
| 3F Feature flags | 100% code ship + flag-evaluated activation | Flag config changes (targeting rules) | Flag-evaluation service (OSS or SaaS) |
| 3G Blue-green | Instant cutover + instant revert | Full-environment validation + switch | Duplicate infrastructure during rollout |
| 3H Google SRE principles | Context-dependent | "Enough for issues to manifest"; representative canary population | No prescribed infrastructure |

---

## Reference docs status

**Reference docs updated:** none this round — report is net-new; will add landscape entries in the followup.

**Pending landscape additions** (Researcher owns landscape accuracy per Insight-043, to add before Architect references these in a brief):
- TUF + tuf-js
- Sigstore + cosign + sigstore-js
- npm ECDSA registry signatures + ssri
- Omaha protocol
- in-toto + SLSA framework
- Notary v2 / notation
- gh attestation
- Argo Rollouts
- Flagger
- Kayenta
- OpenFeature + Unleash + Flagsmith
- RAPPOR (as privacy-primitive reference)
- Secure Aggregation libraries (TFF, Flower) — if federated-learning primitives surface later

These landscape entries are to be added in a separate commit so the Architect can reference them when writing ADR-031/ADR-032 or sub-briefs 182/184.

## Open design questions surfaced (for Architect)

1. **Offline-signing requirement.** If the release signing key must be air-gapped (common threat model), Sigstore's keyless + live-Rekor is ruled out. Is this a hard requirement?
2. **Key rotation cadence.** Does the network plan annual rotation, on-compromise, or never? Affects choice between TUF (rotation built-in) vs simpler options.
3. **Node offline tolerance.** How long can a node be offline and still trust releases on return? Bounds on timestamp expiration, freshness thresholds.
4. **Privacy signal grain — any free text?** If any evidence signal contains free text (e.g. an LLM-generated classification description), type-level PII enforcement is not sufficient and 2D/2E become relevant. If all signals are enum-only, 2F is sufficient.
5. **Canary cohort selection.** Random 5% of nodes? Channel-based (nightly-channel only)? Specific dogfood nodes? Affects 3A extension.
6. **Statistical canary analysis — later phase?** 3D-style statistical comparison may be overkill for month-1 but worth scoping for month-6+ when node count is non-trivial.

## Sources

- [The Update Framework Specification](https://theupdateframework.github.io/specification/latest/)
- [theupdateframework/tuf-js](https://github.com/theupdateframework/tuf-js)
- [sigstore/cosign](https://github.com/sigstore/cosign)
- [sigstore/sigstore-js](https://github.com/sigstore/sigstore-js)
- [npm/ssri](https://github.com/npm/ssri)
- [npm ECDSA registry signatures](https://docs.npmjs.com/verifying-registry-signatures/)
- [google/omaha](https://github.com/google/omaha)
- [Debian SecureApt](https://wiki.debian.org/SecureApt)
- [k-anonymity — Wikipedia](https://en.wikipedia.org/wiki/K-anonymity)
- [t-Closeness — Li et al. 2007](https://ieeexplore.ieee.org/document/4221659/)
- [Data Privacy Handbook](https://utrechtuniversity.github.io/dataprivacyhandbook/k-l-t-anonymity.html)
- [Apple Learning with Privacy at Scale](https://machinelearning.apple.com/research/learning-with-privacy-at-scale)
- [Real-world DP deployments](https://desfontain.es/blog/real-world-differential-privacy.html)
- [argoproj/argo-rollouts](https://github.com/argoproj/argo-rollouts)
- [fluxcd/flagger](https://github.com/fluxcd/flagger)
- [spinnaker/kayenta](https://github.com/spinnaker/kayenta)
- [Google SRE — Canarying Releases](https://sre.google/workbook/canarying-releases/)
- [Chrome release channels](https://www.chromium.org/getting-involved/chrome-release-channels/)
- Ditto internal: `docs/briefs/complete/091-fleet-upgrades.md`, `docs/insights/111-explicit-implicit-signal-separation.md`, `docs/adrs/025-centralized-network-service.md`
