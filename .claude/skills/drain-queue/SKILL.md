---
name: drain-queue
description: Cross-brief autopilot — claim the oldest ready brief whose Brief NNN deps are satisfied via atomic push, run /autobuild on each, stop when the queue is empty, blocked, or hits a failure.
argument-hint: "[max-briefs | all]"
disable-model-invocation: true
---

@.catalyst/skills/drain-queue/SKILL.md
