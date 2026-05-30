/**
 * Intro Decision Email Templates (Brief 288)
 *
 * Three pure template builders for the outbound (Mira-proposed) intro flow:
 *   - renderRequesterApprovalEmail — Mira → requester ("approve to ask Priya?")
 *   - renderRecipientApprovalEmail — Mira → recipient ("Rob would like an intro — OK?")
 *   - renderWarmIntroThreadEmail   — Mira → both parties (the warm hand-off)
 *
 * Each builder is a pure string composer. The body must render under 200 words
 * (D5 from Brief 276). The shared helper `assertUnder200Words` is intentionally
 * a hard throw so the regression test in AC #12 catches drift before deploy.
 *
 * No DB, no email send. Consumers wrap these in compliance/scrubber/send paths.
 */

export interface IntroEmailRenderResult {
  subject: string;
  body: string;
}

export interface RequesterApprovalEmailInput {
  requesterFirstName: string;
  recipientDisplayName: string;
  whyThisFits: string;
  whyNow: string;
  costLabel: string | null;
  magicLinkUrl: string;
  chatUrl: string;
}

export interface RecipientApprovalEmailInput {
  recipientFirstName: string;
  requesterDisplayName: string;
  whyThisFits: string;
  whatStaysPrivate: string[];
  magicLinkUrl: string;
  chatUrl: string;
}

export interface WarmIntroThreadEmailInput {
  requesterFirstName: string;
  recipientFirstName: string;
  requesterOneLine: string;
  recipientOneLine: string;
  context: string;
}

export interface FollowUpEmailInput {
  recipientFirstName: string;
  introSubjectLabel: string;
  usefulUrl: string;
  notUsefulUrl: string;
  noOutcomeYetUrl: string;
}

/** Hard cap per D5. Counts whitespace-separated tokens; matches what a
 *  reasonable observer would call a "word". */
export function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export function assertUnder200Words(body: string, label: string): void {
  const count = wordCount(body);
  if (count >= 200) {
    throw new Error(
      `${label} body is ${count} words; must be under 200 (Brief 288 AC #12)`,
    );
  }
}

function firstName(value: string): string {
  return value.split(/\s+/)[0] || value;
}

export function renderRequesterApprovalEmail(
  input: RequesterApprovalEmailInput,
): IntroEmailRenderResult {
  const subject = `Mira: intro to ${input.recipientDisplayName}?`;
  const cost = input.costLabel ? `\n\n${input.costLabel}` : "";
  const body = [
    `Hi ${firstName(input.requesterFirstName)},`,
    ``,
    `I think ${input.recipientDisplayName} could be a strong fit for what you're working on.`,
    ``,
    `Why this fits: ${input.whyThisFits}`,
    ``,
    `Why now: ${input.whyNow}`,
    ``,
    `If you're in, I'll ask ${firstName(input.recipientDisplayName)} next. They get the same one-screen ask, and only see what's in the recipient preview — nothing private.`,
    ``,
    `Approve: ${input.magicLinkUrl}`,
    `Review or refine in chat: ${input.chatUrl}`,
    `${cost}`,
    ``,
    `— Mira`,
  ].join("\n");
  assertUnder200Words(body, "renderRequesterApprovalEmail");
  return { subject, body };
}

export function renderRecipientApprovalEmail(
  input: RecipientApprovalEmailInput,
): IntroEmailRenderResult {
  const subject = `${firstName(input.requesterDisplayName)} would like an intro — open to it?`;
  const stays = input.whatStaysPrivate.length
    ? `\n\nWhat stays private: ${input.whatStaysPrivate.join("; ")}.`
    : "";
  const body = [
    `Hi ${firstName(input.recipientFirstName)},`,
    ``,
    `${input.requesterDisplayName} asked me to introduce them. Before I do, I want your OK.`,
    ``,
    `Why this fits: ${input.whyThisFits}`,
    `${stays}`,
    ``,
    `If you're up for it, I'll send the warm intro next — both of you on the thread. If not, that's fine; I'll let them know without sharing your reason.`,
    ``,
    `Approve: ${input.magicLinkUrl}`,
    `Open chat (decline, edit, or "not now"): ${input.chatUrl}`,
    ``,
    `— Mira`,
  ].join("\n");
  assertUnder200Words(body, "renderRecipientApprovalEmail");
  return { subject, body };
}

export function renderWarmIntroThreadEmail(
  input: WarmIntroThreadEmailInput,
): IntroEmailRenderResult {
  const subject = `Intro: ${firstName(input.requesterFirstName)} <> ${firstName(input.recipientFirstName)}`;
  const body = [
    `${firstName(input.requesterFirstName)}, meet ${firstName(input.recipientFirstName)}. ${firstName(input.recipientFirstName)}, meet ${firstName(input.requesterFirstName)}.`,
    ``,
    `${firstName(input.requesterFirstName)} — ${input.requesterOneLine}.`,
    `${firstName(input.recipientFirstName)} — ${input.recipientOneLine}.`,
    ``,
    `Why I think this one works: ${input.context}`,
    ``,
    `I'll step out of the thread now — take it from here.`,
    ``,
    `— Mira`,
  ].join("\n");
  assertUnder200Words(body, "renderWarmIntroThreadEmail");
  return { subject, body };
}

export function renderFollowUpEmail(
  input: FollowUpEmailInput,
): IntroEmailRenderResult {
  const subject = `Mira: was this intro useful?`;
  const body = [
    `Hi ${firstName(input.recipientFirstName)},`,
    ``,
    `Quick check on ${input.introSubjectLabel}: was the intro useful?`,
    ``,
    `Useful: ${input.usefulUrl}`,
    `Not useful: ${input.notUsefulUrl}`,
    `No outcome yet: ${input.noOutcomeYetUrl}`,
    ``,
    `If there's nuance, reply to this email and I'll fold it into what Ditto learns for next time.`,
    ``,
    `— Mira`,
  ].join("\n");
  assertUnder200Words(body, "renderFollowUpEmail");
  return { subject, body };
}
