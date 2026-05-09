"use client";

import type { NetworkProfileCardBlock } from "@/lib/engine";
import { NetworkProfileCardRenderer } from "@/app/network/chat/network-profile-card-renderer";

export function NetworkProfileCardBlockComponent({
  block,
}: {
  block: NetworkProfileCardBlock;
}) {
  return (
    <div className="my-4">
      <NetworkProfileCardRenderer card={block} />
    </div>
  );
}
