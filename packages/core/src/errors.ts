/**
 * Shared engine errors.
 */

export class MissingStepRunIdError extends Error {
  constructor(message = "stepRunId is required for harness-governed side effects") {
    super(message);
    this.name = "MissingStepRunIdError";
  }
}
