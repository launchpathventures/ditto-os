import { beforeEach, describe, expect, it, vi } from "vitest";

const notifyUserMock = vi.fn();

vi.mock("./notify-user", () => ({
  notifyUser: notifyUserMock,
}));

vi.mock("../db/network-db", () => ({
  networkDb: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [
            {
              email: "owner@example.com",
              name: "Owner",
              personId: "person-1",
            },
          ],
        }),
      }),
    }),
  },
}));

describe("sendWorkspaceWelcome", () => {
  beforeEach(() => {
    notifyUserMock.mockReset();
  });

  it("rejects missing bootstrap URLs instead of creating Network-local magic links", async () => {
    const { sendWorkspaceWelcome } = await import("./workspace-welcome");

    const result = await sendWorkspaceWelcome("user-1", "https://workspace.example.com", {
      bootstrapLoginUrl: "",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/bootstrap login URL is required/);
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("rejects bootstrap URLs that do not target the provisioned workspace", async () => {
    const { sendWorkspaceWelcome } = await import("./workspace-welcome");

    const result = await sendWorkspaceWelcome("user-1", "https://workspace.example.com", {
      bootstrapLoginUrl: "https://ditto.partners/login/auth?token=wbt_bad.sig",
    });

    expect(result.success).toBe(false);
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("sends a welcome email with a workspace-scoped bootstrap URL", async () => {
    const { sendWorkspaceWelcome } = await import("./workspace-welcome");

    const result = await sendWorkspaceWelcome("user-1", "https://workspace.example.com", {
      bootstrapLoginUrl: "https://workspace.example.com/login/auth?token=wbt_good.sig",
    });

    expect(result).toEqual({
      success: true,
      magicLinkUrl: "https://workspace.example.com/login/auth?token=wbt_good.sig",
    });
    expect(notifyUserMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      personId: "person-1",
      body: expect.stringContaining("https://workspace.example.com/login/auth?token=wbt_good.sig"),
    }));
  });
});
