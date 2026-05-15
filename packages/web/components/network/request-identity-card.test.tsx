import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  RequestIdentityCard,
  isIdentityCompleteEnough,
  type RequestIdentity,
} from "./request-identity-card";

const EMPTY: RequestIdentity = { name: "", email: "", orgSite: "", credibility: "" };

describe("isIdentityCompleteEnough", () => {
  it("returns false when name or email is missing", () => {
    expect(isIdentityCompleteEnough(EMPTY)).toBe(false);
    expect(
      isIdentityCompleteEnough({ ...EMPTY, name: "Alex", orgSite: "company.com" }),
    ).toBe(false);
    expect(
      isIdentityCompleteEnough({ ...EMPTY, email: "a@b.com", orgSite: "company.com" }),
    ).toBe(false);
  });

  it("requires name, email, and either orgSite or credibility", () => {
    expect(
      isIdentityCompleteEnough({
        name: "Alex",
        email: "a@b.com",
        orgSite: "company.com",
        credibility: "",
      }),
    ).toBe(true);
    expect(
      isIdentityCompleteEnough({
        name: "Alex",
        email: "a@b.com",
        orgSite: "",
        credibility: "Founder, GTM lead",
      }),
    ).toBe(true);
    expect(
      isIdentityCompleteEnough({
        name: "Alex",
        email: "a@b.com",
        orgSite: "",
        credibility: "",
      }),
    ).toBe(false);
  });
});

describe("RequestIdentityCard", () => {
  it("shows the 'Optional now' badge when empty and renders all field labels", () => {
    const html = renderToStaticMarkup(
      React.createElement(RequestIdentityCard, {
        identity: EMPTY,
        onChange: () => {},
      }),
    );
    expect(html).toContain("Optional now");
    expect(html).toContain("Your name");
    expect(html).toContain("Email");
    expect(html).toContain("Org or site");
    expect(html).toContain("Why you&#x27;re credible");
  });

  it("shows the 'Ready' badge when identity is complete enough", () => {
    const html = renderToStaticMarkup(
      React.createElement(RequestIdentityCard, {
        identity: {
          name: "Alex",
          email: "a@b.com",
          orgSite: "company.com",
          credibility: "",
        },
        onChange: () => {},
      }),
    );
    expect(html).toContain("Ready");
  });
});
