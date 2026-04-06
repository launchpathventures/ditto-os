import type { Metadata } from "next";
import { DittoConversation } from "./ditto-conversation";

export const metadata: Metadata = {
  title: "Ditto — AI that remembers and improves",
  description:
    "A trusted advisor that connects your network and runs your operations. Not a chatbot. Not AI slop. A chief of staff that earns your trust.",
};

export default function WelcomePage() {
  return <DittoConversation />;
}
