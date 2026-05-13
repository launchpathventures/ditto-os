import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetVisitorProfileSessionsForTesting,
  appendVisitorProfileTurn,
  consumePendingVisitorIntro,
  getPendingVisitorIntro,
  getVisitorProfileTranscript,
  setPendingVisitorIntro,
  visitorTranscriptHash,
} from "./visitor-profile-session";

describe("visitor profile session state", () => {
  beforeEach(() => {
    _resetVisitorProfileSessionsForTesting();
  });

  it("stores intro requests against the server-side transcript hash", () => {
    const transcript = appendVisitorProfileTurn("session-1", {
      role: "visitor",
      content: "I'd like an intro to Tim.",
    });
    setPendingVisitorIntro({
      sessionId: "session-1",
      userId: "user-1",
      draft: "Hi Tim - Avery asked for an intro.",
      transcript,
    });

    const pending = getPendingVisitorIntro({ sessionId: "session-1", userId: "user-1" });
    expect(pending).toMatchObject({
      userId: "user-1",
      draft: "Hi Tim - Avery asked for an intro.",
      transcriptHash: visitorTranscriptHash(getVisitorProfileTranscript("session-1")),
    });
  });

  it("consumes a pending intro once approved for delivery", () => {
    const transcript = appendVisitorProfileTurn("session-2", {
      role: "visitor",
      content: "Could you connect me?",
    });
    setPendingVisitorIntro({
      sessionId: "session-2",
      userId: "user-2",
      draft: "Hi Tim - someone asked for an intro.",
      transcript,
    });

    expect(consumePendingVisitorIntro({ sessionId: "session-2", userId: "user-2" })).not.toBeNull();
    expect(getPendingVisitorIntro({ sessionId: "session-2", userId: "user-2" })).toBeNull();
  });
});
