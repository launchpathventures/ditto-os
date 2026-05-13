import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublicBaseUrl } from "./public-url";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getPublicBaseUrl", () => {
  it("prefers NEXT_PUBLIC_APP_URL over the request.url origin", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://workspace.example.com");
    const request = new Request("https://0.0.0.0:8080/login/auth");

    expect(getPublicBaseUrl(request)).toBe("https://workspace.example.com");
  });

  it("strips path and query from NEXT_PUBLIC_APP_URL", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://workspace.example.com/some/path?ignored=1");
    const request = new Request("https://0.0.0.0:8080/login/auth");

    expect(getPublicBaseUrl(request)).toBe("https://workspace.example.com");
  });

  it("falls back to request.url when NEXT_PUBLIC_APP_URL is unset", () => {
    const request = new Request("https://localhost:3000/login/auth?token=abc");

    expect(getPublicBaseUrl(request)).toBe("https://localhost:3000");
  });

  it("falls back to request.url when NEXT_PUBLIC_APP_URL is malformed", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "not a url");
    const request = new Request("https://localhost:3000/login/auth");

    expect(getPublicBaseUrl(request)).toBe("https://localhost:3000");
  });
});
