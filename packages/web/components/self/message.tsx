/**
 * Ditto Conversation Message — Re-export from AI Elements
 *
 * Brief 058: message.tsx rewritten to delegate to AI Elements Message.
 * This file re-exports the adopted component under the old name for
 * compatibility with any imports that reference `ConversationMessage`.
 *
 * Provenance: Brief 058, AI Elements Message adoption.
 */

export { Message as ConversationMessage } from "@/components/ai-elements/message";
