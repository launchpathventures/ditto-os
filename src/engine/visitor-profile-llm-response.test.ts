import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCompletion } from "./llm";
import {
  VISITOR_PROFILE_RESPONSE_TOOL,
  generateVisitorGreeterResponseFromPrompt,
} from "./visitor-profile-chat";

vi.mock("./llm", () => ({
  createCompletion: vi.fn(),
  extractText: (content: Array<Record<string, unknown>>) =>
    content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join(""),
  extractToolUse: (content: Array<Record<string, unknown>>) =>
    content.filter((block) => block.type === "tool_use"),
}));

const mockedCreateCompletion = vi.mocked(createCompletion);

beforeEach(() => {
  mockedCreateCompletion.mockReset();
});

describe("generateVisitorGreeterResponseFromPrompt", () => {
  it("uses the rendered visitor representative prompt for production replies", async () => {
    mockedCreateCompletion.mockImplementationOnce(async (request) => {
      expect(request.purpose).toBe("conversation");
      expect(request.system).toContain("You are their REPRESENTATIVE");
      expect(request.tools?.[0]?.name).toBe(VISITOR_PROFILE_RESPONSE_TOOL.name);
      return {
        content: [
          {
            type: "tool_use",
            id: "toolu_visitor",
            name: VISITOR_PROFILE_RESPONSE_TOOL.name,
            input: {
              kind: "answer",
              reply: "Tim's notes say he builds outbound systems for founder-led B2B teams.",
            },
          },
        ],
        tokensUsed: 10,
        costCents: 1,
        stopReason: "tool_use",
        model: "test",
      };
    });

    const result = await generateVisitorGreeterResponseFromPrompt({
      representativePrompt: "You are their REPRESENTATIVE. You are NOT Tim Green.",
      message: "What does Tim do?",
      userFirst: "Tim",
      userName: "Tim Green",
      greeterName: "Alex",
      facts: [
        {
          factMd: "Tim builds outbound systems for founder-led B2B teams.",
          visibility: "public",
          sourceLabel: "profile card",
        },
      ],
    });

    expect(result).toEqual({
      kind: "answer",
      reply: "Tim's notes say he builds outbound systems for founder-led B2B teams.",
    });
    expect(mockedCreateCompletion).toHaveBeenCalledTimes(1);
  });

  it("falls back to deterministic hard-rule handling if the model discloses AI", async () => {
    mockedCreateCompletion.mockResolvedValueOnce({
      content: [
        {
          type: "tool_use",
          id: "toolu_bad",
          name: VISITOR_PROFILE_RESPONSE_TOOL.name,
          input: {
            kind: "answer",
            reply: "I'm an AI chatbot.",
          },
        },
      ],
      tokensUsed: 10,
      costCents: 1,
      stopReason: "tool_use",
      model: "test",
    });

    const result = await generateVisitorGreeterResponseFromPrompt({
      representativePrompt: "You are their REPRESENTATIVE. You are NOT Tim Green.",
      message: "are you a chatbot?",
      userFirst: "Tim",
      userName: "Tim Green",
      greeterName: "Alex",
    });

    expect(result.reply.toLowerCase()).not.toMatch(/\b(ai|chatbot|language model)\b/);
    expect(result.reply).toContain("Tim's representative");
  });
});
