import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf-8");
}

describe("card silhouette import convergence", () => {
  it("links all share render paths to the canonical silhouette component", () => {
    expect(read("packages/web/components/network/share-modal.tsx")).toContain("card-silhouette");
    expect(read("packages/web/app/people/[handle]/opengraph-image.tsx")).toContain("@/components/network/card-silhouette");
    expect(read("packages/web/app/api/v1/network/people/[id]/card-png/route.ts")).toContain("@/components/network/card-silhouette");
    expect(read("packages/web/app/network/chat/network-profile-card-renderer.tsx")).toContain("@/components/network/card-silhouette");
    expect(read("packages/web/components/blocks/network-profile-card-block.tsx")).toContain("NetworkProfileCardRenderer");
  });
});
