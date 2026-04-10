# Insight-172: Email Is Auth, Not Just Delivery

**Date:** 2026-04-11
**Trigger:** Brief 123 — magic link auth implementation revealed that every Alex email is simultaneously a delivery channel AND an authentication surface
**Layers affected:** L6 Human
**Status:** active

## The Insight

When every outbound email from Alex contains a "Continue in chat" magic link, email transforms from a one-way delivery channel into a persistent re-authentication surface. The user doesn't need to remember a URL, create an account, or manage credentials — every email Alex sends is a door back into the conversation.

This collapses the distinction between "notifying the user" and "inviting the user back." The auto-generation of magic links in `sendAndRecord` means any module that sends email automatically creates a re-entry path without any conscious effort from the developer.

The key design decision: magic link generation is best-effort and non-blocking. If it fails, the email sends without the footer. This prevents auth infrastructure from degrading email reliability.

## Implications

- Every new email template automatically becomes a re-engagement path (no explicit wiring needed)
- The `sendAndRecord` function is now the single point of both delivery AND auth — changes to email sending automatically propagate to auth
- Session revocation must be wired to ALL opt-out paths (inbound email, admin pause, etc.) since any email is now an active session door
- Future surfaces (SMS, push) should follow the same pattern: delivery = auth

## Where It Should Land

Architecture.md Layer 6 — Magic Link as authentication primitive. ADR candidate for the "delivery = auth" pattern.
