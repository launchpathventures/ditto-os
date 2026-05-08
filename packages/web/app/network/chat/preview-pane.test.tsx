import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PreviewPane } from "./preview-pane";

describe("PreviewPane", () => {
  it("renders the expert placeholder branch", () => {
    const html = renderToStaticMarkup(
      React.createElement(PreviewPane, { mode: "expert" }),
    );
    expect(html).toContain("Profile");
    expect(html).toContain("Hunting next thing");
  });

  it("renders the client placeholder branch", () => {
    const html = renderToStaticMarkup(
      React.createElement(PreviewPane, { mode: "client" }),
    );
    expect(html).toContain("Opportunity brief");
    expect(html).toContain("Need the right person");
  });

  it("renders a null-mode ghost placeholder", () => {
    const html = renderToStaticMarkup(
      React.createElement(PreviewPane, { mode: null }),
    );
    expect(html).toContain("Profile");
  });
});
