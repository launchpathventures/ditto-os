import { describe, expect, it, vi } from "vitest";

const validateTokenMock = vi.fn();
const isNetworkDbConnectionErrorMock = vi.fn();

vi.mock("../../../src/engine/network-api-auth", () => ({
  validateToken: validateTokenMock,
}));

vi.mock("../../../src/db/network-db", () => ({
  isNetworkDbConnectionError: isNetworkDbConnectionErrorMock,
}));

describe("network-auth", () => {
  it("returns structured 503 when token validation cannot reach Network DB", async () => {
    const error = new Error("SUPABASE_DB_URL is not set");
    validateTokenMock.mockRejectedValueOnce(error);
    isNetworkDbConnectionErrorMock.mockReturnValueOnce(true);

    const { authenticateAdminRequest } = await import("./network-auth");
    const result = await authenticateAdminRequest(
      new Request("http://test/admin", {
        headers: { authorization: "Bearer dnt_test" },
      }),
    );

    expect(result.authenticated).toBe(false);
    if (result.authenticated) return;
    expect(result.response.status).toBe(503);
    await expect(result.response.json()).resolves.toMatchObject({
      error: "network_db_unavailable",
    });
  });
});
