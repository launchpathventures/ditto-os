import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NetworkKbShelf, mergeFacts } from "./network-kb-shelf";

describe("NetworkKbShelf", () => {
  it("renders upload, voice, manual fact, private-filter, and visibility controls", () => {
    const html = renderToStaticMarkup(
      React.createElement(NetworkKbShelf, { sessionId: "expert-session" }),
    );

    expect(html).toContain("Knowledge shelf");
    expect(html).toContain("Upload");
    expect(html).toContain("Voice");
    expect(html).toContain("Fact");
    expect(html).toContain("Private");
    expect(html).toContain("Public");
    expect(html).toContain("On-request");
    expect(html).toContain("Off");
  });

  it("merges fact updates by id and drops archived facts", () => {
    expect(
      mergeFacts(
        [
          {
            id: "fact-1",
            factMd: "Old fact",
            visibility: "on-request",
            status: "active",
            sourceLabel: "Source",
          },
        ],
        [
          {
            id: "fact-1",
            factMd: "Updated fact",
            visibility: "public",
            status: "active",
            sourceLabel: "Source",
          },
          {
            id: "fact-2",
            factMd: "Archived fact",
            visibility: "off",
            status: "archived",
            sourceLabel: "Source",
          },
        ],
      ),
    ).toEqual([
      {
        id: "fact-1",
        factMd: "Updated fact",
        visibility: "public",
        status: "active",
        sourceLabel: "Source",
      },
    ]);
  });
});
