import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FitConfidenceDot } from "./fit-confidence-dot";

describe("FitConfidenceDot", () => {
  it("renders high as a mint filled dot with a button trigger", () => {
    const html = renderToStaticMarkup(
      React.createElement(FitConfidenceDot, { value: "high" }),
    );

    expect(html).toContain("<button");
    expect(html).toContain("#b7efb2");
    expect(html).toContain("Strong fit on shape + availability");
  });

  it("renders medium as a canary filled dot", () => {
    const html = renderToStaticMarkup(
      React.createElement(FitConfidenceDot, { value: "medium" }),
    );

    expect(html).toContain("#ffef99");
    expect(html).toContain("Some signal - worth a look");
  });

  it("renders low as a hollow ring", () => {
    const html = renderToStaticMarkup(
      React.createElement(FitConfidenceDot, { value: "low" }),
    );

    expect(html).toContain("border-border-muted");
    expect(html).toContain("bg-transparent");
    expect(html).toContain("Long shot - included for breadth");
  });

  it("uses a unique tooltip id per rendered instance", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(FitConfidenceDot, { value: "high" }),
        React.createElement(FitConfidenceDot, { value: "high" }),
      ),
    );
    const ids = Array.from(html.matchAll(/aria-describedby="([^"]+)"/g)).map((match) => match[1]);

    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it("uses the same tooltip for hover and focus-visible states", () => {
    const html = renderToStaticMarkup(
      React.createElement(FitConfidenceDot, { value: "high" }),
    );

    expect(html).toContain("group-hover:opacity-100");
    expect(html).toContain("group-focus-visible:opacity-100");
    expect(html).toContain("role=\"tooltip\"");
  });
});
