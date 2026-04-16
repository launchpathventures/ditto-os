/**
 * Ditto — Tool Resolver
 *
 * Resolves step-level `tools: [service.action]` declarations into
 * LlmToolDefinition[] and an execution dispatch function.
 *
 * Tool definitions come from integration registry YAML.
 * Execution dispatches to CLI or REST handlers based on each tool's execute config.
 *
 * Provenance: ADR-005 Section 4, Insight-065 (Ditto-native tools), Brief 025
 */

import { randomUUID } from "crypto";
import type { LlmToolDefinition } from "./llm";
import type { StagedOutboundAction } from "./harness";
import type {
  IntegrationTool,
  CliExecuteConfig,
  RestExecuteConfig,
} from "./integration-registry";
import { getIntegration } from "./integration-registry";
import { executeCli } from "./integration-handlers/cli";
import { executeRest } from "./integration-handlers/rest";
// Dynamic import to avoid pulling LanceDB native binary into webpack bundle
// import { searchKnowledge, formatResultsForPrompt } from "./knowledge/search";

/** Execution context for identity-aware tool dispatch (Brief 152) */
export interface ToolExecutionContext {
  sendingIdentity?: string;
  userId?: string;
  stepRunId?: string;
}

export interface ResolvedTools {
  /** LLM-native tool definitions for the LLM to call */
  tools: LlmToolDefinition[];
  /** Dispatch function: given tool name + input, executes and returns result text */
  executeIntegrationTool: (
    name: string,
    input: Record<string, unknown>,
    context?: ToolExecutionContext,
  ) => Promise<string>;
}

// ============================================================
// Built-in engine tools (Brief 079)
// Resolved via `knowledge.search` etc in process YAML.
// ============================================================

interface BuiltInTool {
  definition: LlmToolDefinition;
  execute: (input: Record<string, unknown>, stepRunId?: string, context?: ToolExecutionContext) => Promise<string>;
  /** If true, tool calls queue to stagedOutboundActions instead of dispatching (Brief 129) */
  staged?: boolean;
  /** Extract content/channel/recipientId from args for quality gate checking */
  extractOutboundMeta?: (args: Record<string, unknown>) => {
    content?: string;
    channel?: string;
    recipientId?: string;
  };
}

const builtInTools: Record<string, BuiltInTool> = {
  // ---- CRM tools (Brief 097) ----
  "crm.send_email": {
    staged: true,
    extractOutboundMeta: (args: Record<string, unknown>) => {
      const subject = args.subject as string | undefined;
      const body = args.body as string | undefined;
      const content = subject && body ? `${subject}\n\n${body}` : subject ?? body;
      return {
        content,
        channel: "email",
        recipientId: args.personId as string | undefined,
      };
    },
    definition: {
      name: "crm_send_email",
      description:
        "Send an email on behalf of the user and record it as an interaction. Every email is tracked — no silent sends.",
      input_schema: {
        type: "object" as const,
        properties: {
          to: {
            type: "string",
            description: "Recipient email address",
          },
          subject: {
            type: "string",
            description: "Email subject line",
          },
          body: {
            type: "string",
            description: "Email body text",
          },
          personId: {
            type: "string",
            description: "Person ID from the people table",
          },
          mode: {
            type: "string",
            description: "Outreach mode: selling, connecting, or nurture",
          },
          processRunId: {
            type: "string",
            description: "Process run ID (if called from a process step)",
          },
        },
        required: ["to", "subject", "body", "personId", "mode"],
      },
    },
    execute: async (input: Record<string, unknown>, executionStepRunId?: string, execContext?: ToolExecutionContext): Promise<string> => {
      const { sendAndRecord } = await import("./channel");
      const { resolveEmailChannel } = await import("./channel-resolver");

      const userId = execContext?.userId ?? "founder";
      const sendingIdentity = execContext?.sendingIdentity;

      // Brief 152: resolve the email channel based on sending identity
      const { adapter, fromIdentity } = await resolveEmailChannel(sendingIdentity, userId);

      const result = await sendAndRecord({
        to: input.to as string,
        subject: input.subject as string,
        body: input.body as string,
        personaId: fromIdentity.personaId,
        mode: (input.mode as "selling" | "connecting" | "nurture") ?? "nurture",
        personId: input.personId as string,
        userId,
        processRunId: input.processRunId as string | undefined,
        includeOptOut: true,
        stepRunId: executionStepRunId,
        sendingIdentity: sendingIdentity as "principal" | "user" | "agent-of-user" | "ghost" | undefined,
        adapter,
      });
      return JSON.stringify(result, null, 2);
    },
  },

  "crm.record_interaction": {
    definition: {
      name: "crm_record_interaction",
      description:
        "Record an interaction (email, meeting, call) with a person in the network. Used for tracking all touchpoints.",
      input_schema: {
        type: "object" as const,
        properties: {
          personId: {
            type: "string",
            description: "Person ID from the people table",
          },
          type: {
            type: "string",
            description: "Interaction type: outreach_sent, follow_up, reply_received, reply_sent, introduction_made, introduction_received, meeting_booked, nurture, opt_out",
          },
          channel: {
            type: "string",
            description: "Channel: email, voice, sms (default: email)",
          },
          mode: {
            type: "string",
            description: "Mode: selling, connecting, or nurture",
          },
          subject: {
            type: "string",
            description: "Subject or title of the interaction",
          },
          summary: {
            type: "string",
            description: "Brief summary of the interaction",
          },
          outcome: {
            type: "string",
            description: "Outcome: positive, negative, neutral, no_response",
          },
          processRunId: {
            type: "string",
            description: "Process run ID (if called from a process step)",
          },
        },
        required: ["personId", "type", "mode"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const { recordInteraction } = await import("./people");
      const interaction = await recordInteraction({
        personId: input.personId as string,
        userId: "founder", // single-user MVP
        type: input.type as import("../db/schema").InteractionType,
        channel: (input.channel as import("../db/schema").InteractionChannel) ?? "email",
        mode: input.mode as import("../db/schema").InteractionMode,
        subject: input.subject as string | undefined,
        summary: input.summary as string | undefined,
        outcome: (input.outcome as import("../db/schema").InteractionOutcome) ?? "pending",
        processRunId: input.processRunId as string | undefined,
      });
      return JSON.stringify({ success: true, interactionId: interaction.id }, null, 2);
    },
  },

  "crm.create_person": {
    definition: {
      name: "crm_create_person",
      description:
        "Create a new person in the network. Returns the person ID for use in interactions and outreach.",
      input_schema: {
        type: "object" as const,
        properties: {
          name: {
            type: "string",
            description: "Person's full name",
          },
          email: {
            type: "string",
            description: "Email address",
          },
          organization: {
            type: "string",
            description: "Company or organization name",
          },
          role: {
            type: "string",
            description: "Job title or role",
          },
          source: {
            type: "string",
            description: "How this person was found: manual, research, referral, inbound",
          },
        },
        required: ["name"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const { createPerson } = await import("./people");
      const person = await createPerson({
        userId: "founder", // single-user MVP
        name: input.name as string,
        email: input.email as string | undefined,
        organization: input.organization as string | undefined,
        role: input.role as string | undefined,
        source: (input.source as import("../db/schema").PersonSource) ?? "research",
        visibility: "internal",
      });
      return JSON.stringify({ success: true, personId: person.id }, null, 2);
    },
  },

  // ---- Web tools (GTM pipeline, front door) ----
  "web-search": {
    definition: {
      name: "web_search",
      description:
        "Search the web in real-time via Perplexity Sonar. Returns a synthesized answer with sources. Use for researching people, companies, pain signals, competitors, and market trends.",
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "The search query — natural language question or keywords",
          },
        },
        required: ["query"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const { webSearch } = await import("./web-search");
      const query = input.query as string;
      const result = await webSearch(query);
      return result ?? "No results — PERPLEXITY_API_KEY may not be configured.";
    },
  },

  "web-fetch": {
    definition: {
      name: "web_fetch",
      description:
        "Fetch a URL and extract readable text content. Use for reading websites, profiles, portfolios, articles, and landing pages shared during research or outreach.",
      input_schema: {
        type: "object" as const,
        properties: {
          url: {
            type: "string",
            description: "The URL to fetch (https:// added automatically if missing)",
          },
        },
        required: ["url"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const { fetchUrlContent } = await import("./web-fetch");
      const url = input.url as string;
      const result = await fetchUrlContent(url);
      if (result.error) return `Error: ${result.error}`;
      return result.content ?? "No readable content extracted from the page.";
    },
  },

  // ---- Social publishing tools (ADR-029, Brief 141) ----
  "social.publish_post": {
    staged: true,
    extractOutboundMeta: (args: Record<string, unknown>) => ({
      content: args.content as string | undefined,
      channel: (args.platform as string) ?? "social",
    }),
    definition: {
      name: "social_publish_post",
      description:
        "Publish a post to LinkedIn or X. LinkedIn uses Unipile Posts API, X uses X API v2. For X threads, provide threadTweets as an array. Returns postId and postUrl for engagement tracking.",
      input_schema: {
        type: "object" as const,
        properties: {
          platform: {
            type: "string",
            enum: ["linkedin", "x"],
            description: "Platform to publish on",
          },
          content: {
            type: "string",
            description: "Post content text. For single posts on either platform.",
          },
          threadTweets: {
            type: "array",
            items: { type: "string" },
            description: "For X threads only: array of tweet texts posted sequentially. First tweet is the head.",
          },
          unipileAccountId: {
            type: "string",
            description: "Unipile account ID (required for LinkedIn publishing)",
          },
          mediaFilePaths: {
            type: "array",
            items: { type: "string" },
            description: "Local file paths for images/video to attach. Get these from content.generate_image asset filePath.",
          },
        },
        required: ["platform", "content"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const { publishPost } = await import("./channel");
      const platform = input.platform as "linkedin" | "x";
      const content = input.content as string;
      const result = await publishPost(platform, content, {
        stepRunId: input._stepRunId as string | undefined,
        unipileAccountId: input.unipileAccountId as string | undefined,
        threadTweets: input.threadTweets as string[] | undefined,
        mediaFilePaths: input.mediaFilePaths as string[] | undefined,
      });
      return JSON.stringify(result, null, 2);
    },
  },

  "crm.send_social_dm": {
    staged: true,
    extractOutboundMeta: (args: Record<string, unknown>) => ({
      content: args.body as string | undefined,
      channel: (args.platform as string) ?? "social",
      recipientId: args.personId as string | undefined,
    }),
    definition: {
      name: "crm_send_social_dm",
      description:
        "Send a direct message on LinkedIn (via Unipile) or X (via X API). Records the interaction. For LinkedIn, requires unipileAccountId.",
      input_schema: {
        type: "object" as const,
        properties: {
          to: {
            type: "string",
            description: "Recipient identifier — Unipile attendee ID (LinkedIn) or X user ID",
          },
          body: {
            type: "string",
            description: "Message body text",
          },
          platform: {
            type: "string",
            enum: ["linkedin", "whatsapp", "instagram", "telegram", "x"],
            description: "Social platform to send on",
          },
          personId: {
            type: "string",
            description: "Person ID from the people table",
          },
          mode: {
            type: "string",
            description: "Outreach mode: selling, connecting, or nurture",
          },
          unipileAccountId: {
            type: "string",
            description: "Unipile account ID for the connected social account (required for LinkedIn/WhatsApp/Instagram/Telegram)",
          },
          processRunId: {
            type: "string",
            description: "Process run ID (if called from a process step)",
          },
        },
        required: ["to", "body", "platform", "personId", "mode"],
      },
    },
    execute: async (input: Record<string, unknown>, executionStepRunId?: string): Promise<string> => {
      const { sendAndRecord } = await import("./channel");
      const platform = input.platform as string;

      // X DMs go through X API, not Unipile (Unipile X is deprecated)
      if (platform === "x") {
        // X DM sending via X API v2
        const { XApiClient, getXApiConfig } = await import("./channel");
        const config = getXApiConfig();
        if (!config) {
          return JSON.stringify({ success: false, error: "X API not configured" });
        }
        const client = new XApiClient(config);
        try {
          const result = await client.sendDm(input.to as string, input.body as string);
          // Record the interaction
          const { recordInteraction } = await import("./people");
          await recordInteraction({
            personId: input.personId as string,
            userId: "founder",
            type: "outreach_sent",
            channel: "social",
            mode: (input.mode as "selling" | "connecting" | "nurture") ?? "nurture",
            subject: `X DM`,
            summary: (input.body as string).slice(0, 200),
            outcome: "neutral",
            processRunId: input.processRunId as string | undefined,
          });
          return JSON.stringify({ success: true, ...result });
        } catch (err) {
          return JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) });
        }
      }

      // LinkedIn/WhatsApp/Instagram/Telegram go through Unipile via sendAndRecord
      const result = await sendAndRecord({
        to: input.to as string,
        body: input.body as string,
        personaId: "alex",
        mode: (input.mode as "selling" | "connecting" | "nurture") ?? "nurture",
        personId: input.personId as string,
        userId: "founder",
        processRunId: input.processRunId as string | undefined,
        platform: input.platform as import("./channel").SocialPlatform,
        unipileAccountId: input.unipileAccountId as string | undefined,
        includeOptOut: false, // social DMs don't have opt-out footers
        stepRunId: executionStepRunId,
      });
      return JSON.stringify(result, null, 2);
    },
  },

  // ---- Content asset tools (GTM image generation) ----
  "content.generate_image": {
    definition: {
      name: "content_generate_image",
      description:
        "Generate an image for a social media post using Claude (Anthropic). Returns the asset ID and file path. Use for: quote cards, diagrams, header images, infographics. The image is stored in workspace assets and can be attached to posts via social.publish_post.",
      input_schema: {
        type: "object" as const,
        properties: {
          prompt: {
            type: "string",
            description: "Image generation prompt — be specific about style, composition, text to include. E.g., 'Clean dark-mode quote card with the text: Most agent frameworks solve the wrong problem. Minimal design, monospace font, subtle gradient background.'",
          },
          name: {
            type: "string",
            description: "Human-readable name for the asset (e.g., 'Trust thread header image')",
          },
        },
        required: ["prompt", "name"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const prompt = input.prompt as string;
      const name = input.name as string;

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return JSON.stringify({ success: false, error: "ANTHROPIC_API_KEY not configured" });
      }

      try {
        // Call Claude with image generation (requires beta header)
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2025-04-14",
            "anthropic-beta": "image-generation-2025-04-14",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-5-20250514",
            max_tokens: 16384,
            messages: [{
              role: "user",
              content: `Generate an image: ${prompt}`,
            }],
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          return JSON.stringify({ success: false, error: `Anthropic API error ${response.status}: ${errorText}` });
        }

        const data = (await response.json()) as {
          content: Array<{ type: string; source?: { type: string; media_type: string; data: string } }>;
        };

        // Find the image block in the response
        const imageBlock = data.content.find(
          (block) => block.type === "image" && block.source?.type === "base64",
        );

        if (!imageBlock?.source?.data) {
          return JSON.stringify({ success: false, error: "No image generated — Claude may not have produced an image for this prompt. Try being more explicit: 'Generate an image of...'" });
        }

        const buffer = Buffer.from(imageBlock.source.data, "base64");
        const mimeType = imageBlock.source.media_type || "image/png";

        // Save to workspace asset storage
        const { saveAsset } = await import("./asset-storage");
        const asset = await saveAsset({
          buffer,
          name,
          mimeType,
          source: "generated",
          prompt,
          processRunId: input._stepRunId as string | undefined,
        });

        return JSON.stringify({
          success: true,
          assetId: asset.id,
          filePath: asset.filePath,
          mimeType,
          sizeBytes: buffer.length,
        }, null, 2);
      } catch (err) {
        return JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) });
      }
    },
  },

  "content.request_screen_recording": {
    definition: {
      name: "content_request_screen_recording",
      description:
        "Request a screen recording from the user via ScreenRun. Returns a checklist block with a link to ScreenRun and instructions for what to record. The user records, exports MP4, and uploads via the upload action. Use when a product demo, walkthrough, or screen recording would make the post significantly more engaging.",
      input_schema: {
        type: "object" as const,
        properties: {
          title: {
            type: "string",
            description: "What to title this recording (e.g., 'Ditto GTM pipeline demo')",
          },
          instructions: {
            type: "string",
            description: "Specific recording instructions — what to show, how long, what to highlight. Be precise so the user can record quickly.",
          },
          suggestedDuration: {
            type: "string",
            description: "Suggested duration (e.g., '30 seconds', '60 seconds')",
          },
          targetPost: {
            type: "string",
            description: "Which post this recording is for (e.g., 'Credibility thread: trust-earning demo')",
          },
        },
        required: ["title", "instructions"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const title = input.title as string;
      const instructions = input.instructions as string;
      const duration = (input.suggestedDuration as string) || "30-60 seconds";
      const targetPost = (input.targetPost as string) || "social post";

      return JSON.stringify({
        success: true,
        type: "user_action_required",
        action: "screen_recording",
        screenRunUrl: "https://screenrun.app",
        title,
        instructions: [
          `**Record:** ${title}`,
          `**Duration:** ${duration}`,
          `**What to show:** ${instructions}`,
          `**For:** ${targetPost}`,
          "",
          "**Steps:**",
          "1. Open ScreenRun → https://screenrun.app",
          "2. Record the demo following the instructions above",
          "3. Export as MP4 (HD 720p, Wide 16:9)",
          "4. Upload the file — tell me the file path or drag it in",
          "",
          "I'll attach it to the post and publish with the video.",
        ].join("\n"),
      }, null, 2);
    },
  },

  "content.upload_asset": {
    definition: {
      name: "content_upload_asset",
      description:
        "Register an externally created file (screen recording, manually created image, etc.) as a workspace asset. Copies the file to workspace asset storage and returns the assetId and filePath for use with social.publish_post.",
      input_schema: {
        type: "object" as const,
        properties: {
          sourcePath: {
            type: "string",
            description: "Absolute path to the file to import (e.g., /Users/thg/Downloads/demo.mp4)",
          },
          name: {
            type: "string",
            description: "Human-readable name for the asset",
          },
        },
        required: ["sourcePath", "name"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const sourcePath = input.sourcePath as string;
      const name = input.name as string;
      const fs = require("fs") as typeof import("fs");
      const path = require("path") as typeof import("path");

      if (!fs.existsSync(sourcePath)) {
        return JSON.stringify({ success: false, error: `File not found: ${sourcePath}` });
      }

      const buffer = fs.readFileSync(sourcePath);
      const ext = path.extname(sourcePath).toLowerCase();
      const mimeMap: Record<string, string> = {
        ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
        ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".gif": "image/gif", ".webp": "image/webp",
      };
      const mimeType = mimeMap[ext] || "application/octet-stream";

      const { saveAsset } = await import("./asset-storage");
      const asset = await saveAsset({
        buffer,
        name,
        mimeType,
        source: "uploaded",
        processRunId: input._stepRunId as string | undefined,
      });

      return JSON.stringify({
        success: true,
        assetId: asset.id,
        filePath: asset.filePath,
        mimeType,
        sizeBytes: buffer.length,
        sizeMB: (buffer.length / (1024 * 1024)).toFixed(1),
      }, null, 2);
    },
  },

  // ---- CRM read tools (follow-up-sequences, pipeline-tracking) ----
  "crm.get_interactions": {
    definition: {
      name: "crm_get_interactions",
      description:
        "Get all interactions (emails, DMs, meetings) with a person. Returns chronological list with type, channel, subject, summary, outcome, and timestamps.",
      input_schema: {
        type: "object" as const,
        properties: {
          personId: {
            type: "string",
            description: "Person ID from the people table",
          },
        },
        required: ["personId"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const { listInteractions } = await import("./people");
      const interactions = await listInteractions(input.personId as string);
      if (interactions.length === 0) return "No interactions found for this person.";
      return JSON.stringify(
        interactions.map((i) => ({
          type: i.type,
          channel: i.channel,
          mode: i.mode,
          subject: i.subject,
          summary: i.summary,
          outcome: i.outcome,
          date: i.createdAt?.toISOString(),
        })),
        null,
        2,
      );
    },
  },

  "crm.get_pipeline": {
    definition: {
      name: "crm_get_pipeline",
      description:
        "Get all people in the network with their interaction history summary. Returns name, email, org, role, relationship stage, last interaction, and interaction count. Use for pipeline reviews and briefings.",
      input_schema: {
        type: "object" as const,
        properties: {
          userId: {
            type: "string",
            description: "User ID (defaults to 'founder')",
          },
        },
        required: [],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const { listPeopleWithStats } = await import("./people");
      const userId = (input.userId as string) || "founder";
      const people = await listPeopleWithStats(userId);
      if (people.length === 0) return "No people in the pipeline yet.";
      return JSON.stringify(people, null, 2);
    },
  },

  // ---- Social engagement tools (GTM LEARN/SENSE) ----
  "social.get_post_metrics": {
    definition: {
      name: "social_get_post_metrics",
      description:
        "Get engagement metrics for a published post. LinkedIn: likes, comments, shares via Unipile. X: likes, retweets, replies, impressions via X API v2. Returns metrics + notable comments/replies.",
      input_schema: {
        type: "object" as const,
        properties: {
          platform: {
            type: "string",
            enum: ["linkedin", "x"],
            description: "Platform the post was published on",
          },
          postId: {
            type: "string",
            description: "Platform post ID (returned from social.publish_post)",
          },
          unipileAccountId: {
            type: "string",
            description: "Unipile account ID (required for LinkedIn)",
          },
        },
        required: ["platform", "postId"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const platform = input.platform as string;
      const postId = input.postId as string;

      if (platform === "linkedin") {
        try {
          const { getUnipileConfig } = await import("./channel");
          const { UnipileClient } = await import("unipile-node-sdk");
          const config = getUnipileConfig();
          if (!config) return JSON.stringify({ error: "Unipile not configured" });

          const client = new UnipileClient(config.dsn, config.apiKey);
          // Use Unipile Posts API to get post details + comments
          type PostsClient = {
            users: {
              getPost: (params: { account_id: string; post_id: string }) => Promise<Record<string, unknown>>;
              getAllPostComments: (params: { account_id: string; post_id: string }) => Promise<{ items?: Array<Record<string, unknown>> }>;
            };
          };
          const postsClient = client as unknown as PostsClient;
          const accountId = input.unipileAccountId as string;

          const [post, commentsResult] = await Promise.allSettled([
            accountId ? postsClient.users.getPost({ account_id: accountId, post_id: postId }) : Promise.reject("no accountId"),
            accountId ? postsClient.users.getAllPostComments({ account_id: accountId, post_id: postId }) : Promise.reject("no accountId"),
          ]);

          const postData = post.status === "fulfilled" ? post.value : {};
          const comments = commentsResult.status === "fulfilled" ? (commentsResult.value.items ?? []) : [];

          return JSON.stringify({
            platform: "linkedin",
            postId,
            metrics: {
              likes: (postData as Record<string, unknown>).likes_count ?? "unknown",
              comments: comments.length,
              shares: (postData as Record<string, unknown>).shares_count ?? "unknown",
              impressions: (postData as Record<string, unknown>).impressions_count ?? "unknown",
            },
            notableComments: comments.slice(0, 5).map((c: Record<string, unknown>) => ({
              author: c.author_name ?? c.author,
              text: c.text ?? c.content,
            })),
          }, null, 2);
        } catch (err) {
          return JSON.stringify({ platform: "linkedin", postId, error: err instanceof Error ? err.message : String(err) });
        }
      }

      if (platform === "x") {
        try {
          const { XApiClient, getXApiConfig } = await import("./channel");
          const config = getXApiConfig();
          if (!config) return JSON.stringify({ error: "X API not configured" });

          const client = new XApiClient(config);
          const metrics = await client.getTweetMetrics(postId);
          return JSON.stringify({ platform: "x", postId, ...metrics }, null, 2);
        } catch (err) {
          return JSON.stringify({ platform: "x", postId, error: err instanceof Error ? err.message : String(err) });
        }
      }

      return JSON.stringify({ error: `Unsupported platform: ${platform}` });
    },
  },

  // ---- Browser tools (Brief 134) ----
  "browse-web": {
    definition: {
      name: "browse_web",
      description:
        "Browse a URL or search the web and extract structured data using AI. READ-only — for research, profile viewing, data extraction. No form submission or message sending.",
      input_schema: {
        type: "object" as const,
        properties: {
          url: {
            type: "string",
            description: "URL to navigate to",
          },
          query: {
            type: "string",
            description: "Search query (used when no URL provided)",
          },
          extractionGoal: {
            type: "string",
            description: "What to extract from the page — natural language instruction",
          },
          tokenBudget: {
            type: "number",
            description: "Max tokens for Stagehand AI calls (default: 500)",
          },
        },
        required: ["extractionGoal"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const { handleBrowseWeb } = await import("./self-tools/browser-tools");
      const result = await handleBrowseWeb({
        url: input.url as string | undefined,
        query: input.query as string | undefined,
        extractionGoal: input.extractionGoal as string,
        tokenBudget: input.tokenBudget as number | undefined,
      });
      return result.output;
    },
  },

  // ---- Workspace tools (Brief 154) ----
  "workspace.push_blocks": {
    definition: {
      name: "workspace_push_blocks",
      description:
        "Push content blocks into an adaptive workspace view. Blocks appear live in the user's workspace without page reload.",
      input_schema: {
        type: "object" as const,
        properties: {
          viewSlug: {
            type: "string",
            description: "Slug of the target adaptive workspace view",
          },
          blocks: {
            type: "array",
            items: { type: "object" },
            description: "Array of ContentBlock objects to push into the view",
          },
          mode: {
            type: "string",
            enum: ["append", "replace"],
            description: "append: add blocks to existing view. replace: replace all blocks.",
          },
          userId: {
            type: "string",
            description: "Target user ID (defaults to 'founder')",
          },
        },
        required: ["viewSlug", "blocks", "mode"],
      },
    },
    execute: async (input: Record<string, unknown>, executionStepRunId?: string): Promise<string> => {
      if (!executionStepRunId && !process.env.DITTO_TEST_MODE) {
        return JSON.stringify({ success: false, error: "stepRunId required (Insight-180)" });
      }
      const { pushBlocksToWorkspace } = await import("./workspace-push");
      const userId = (input.userId as string) || "founder";
      const eventId = pushBlocksToWorkspace(
        userId,
        input.viewSlug as string,
        input.blocks as import("./content-blocks").ContentBlock[],
        input.mode as "append" | "replace",
        executionStepRunId,
      );
      if (eventId === null) {
        return JSON.stringify({ success: false, error: "Rate limited or rejected" });
      }
      return JSON.stringify({ success: true, eventId });
    },
  },

  "workspace.register_view": {
    definition: {
      name: "workspace_register_view",
      description:
        "Register a new adaptive workspace view. Creates a new navigation item in the user's workspace sidebar with a data-driven composition schema.",
      input_schema: {
        type: "object" as const,
        properties: {
          slug: {
            type: "string",
            description: "URL-safe slug for the view (must be unique per workspace, cannot be a reserved name like 'today', 'inbox', etc.)",
          },
          label: {
            type: "string",
            description: "Human-readable label shown in the sidebar",
          },
          icon: {
            type: "string",
            description: "Optional icon name",
          },
          description: {
            type: "string",
            description: "Optional description of what this view shows",
          },
          schema: {
            type: "object",
            description: "CompositionSchema object: { version: 1, blocks: [...] }. Each block has blockType, content, optional contextQuery and showWhen.",
          },
          sourceProcessId: {
            type: "string",
            description: "Process ID that created this view (for refresh-on-completion linking)",
          },
          userId: {
            type: "string",
            description: "Target user ID (defaults to 'founder')",
          },
          workspaceId: {
            type: "string",
            description: "Target workspace ID (defaults to 'default')",
          },
        },
        required: ["slug", "label", "schema"],
      },
    },
    execute: async (input: Record<string, unknown>, executionStepRunId?: string): Promise<string> => {
      if (!executionStepRunId && !process.env.DITTO_TEST_MODE) {
        return JSON.stringify({ success: false, error: "stepRunId required (Insight-180)" });
      }
      const { registerWorkspaceView } = await import("./workspace-push");
      const userId = (input.userId as string) || "founder";
      const workspaceId = (input.workspaceId as string) || "default";
      const result = await registerWorkspaceView(
        userId,
        workspaceId,
        {
          slug: input.slug as string,
          label: input.label as string,
          icon: input.icon as string | undefined,
          description: input.description as string | undefined,
          schema: input.schema as Record<string, unknown>,
          sourceProcessId: input.sourceProcessId as string | undefined,
        },
        executionStepRunId,
      );
      return JSON.stringify(result, null, 2);
    },
  },

  // ---- Knowledge tools (Brief 079) ----
  "knowledge.search": {
    definition: {
      name: "knowledge_search",
      description:
        "Search the knowledge base for relevant documents. Returns chunks with source citations (file, page, section, line range).",
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "The search query — natural language question or keywords",
          },
          topK: {
            type: "number",
            description: "Number of results to return (default: 5)",
          },
        },
        required: ["query"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const { searchKnowledge, formatResultsForPrompt } = await import("./knowledge/search");
      const query = input.query as string;
      const topK = (input.topK as number) ?? 5;
      const results = await searchKnowledge(query, topK);
      return formatResultsForPrompt(results);
    },
  },
};

/**
 * Interpolate template strings with parameter values.
 * Replaces {param} with the value. No eval() — simple string replacement.
 */
function interpolate(template: string, params: Record<string, unknown>): string {
  let result = template;
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      result = result.replaceAll(`{${key}}`, String(value));
    }
  }
  return result;
}

/**
 * Build a CLI command from a tool's execute config and input parameters.
 */
function buildCliCommand(
  config: CliExecuteConfig,
  input: Record<string, unknown>,
): string {
  let command = interpolate(config.command_template, input);

  // Append optional arg templates when their parameters are provided
  if (config.args) {
    for (const [paramName, argTemplate] of Object.entries(config.args)) {
      if (input[paramName] !== undefined && input[paramName] !== null && input[paramName] !== "") {
        command += " " + interpolate(argTemplate, input);
      }
    }
  }

  return command;
}

/**
 * Convert an IntegrationTool to an LlmToolDefinition.
 * Tool name is prefixed with service name: service.tool_name
 */
function toolToLlmDefinition(
  service: string,
  tool: IntegrationTool,
): LlmToolDefinition {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [paramName, param] of Object.entries(tool.parameters)) {
    properties[paramName] = {
      type: param.type === "string" ? "string" : param.type,
      ...(param.description ? { description: param.description } : {}),
      ...(param.default !== undefined ? { default: param.default } : {}),
    };
    if (param.required) {
      required.push(paramName);
    }
  }

  return {
    name: `${service}.${tool.name}`,
    description: tool.description,
    input_schema: {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
    },
  };
}

/**
 * Execute a CLI-backed integration tool.
 */
async function executeCliTool(
  service: string,
  config: CliExecuteConfig,
  input: Record<string, unknown>,
  processId?: string,
): Promise<string> {
  const integration = getIntegration(service);
  const cliInterface = integration?.interfaces.cli;
  if (!cliInterface) {
    return `Error: service '${service}' has no CLI interface`;
  }

  const command = buildCliCommand(config, input);
  const result = await executeCli({
    service,
    command,
    cliInterface,
    processId,
  });

  // Return the result text for the LLM
  if (result.confidence === "low") {
    return `Error: ${JSON.stringify(result.outputs)}`;
  }
  const output = result.outputs.result;
  return typeof output === "string" ? output : JSON.stringify(output, null, 2);
}

/**
 * Execute a REST-backed integration tool.
 */
async function executeRestTool(
  service: string,
  config: RestExecuteConfig,
  input: Record<string, unknown>,
  processId?: string,
): Promise<string> {
  const integration = getIntegration(service);
  const restInterface = integration?.interfaces.rest;
  if (!restInterface) {
    return `Error: service '${service}' has no REST interface`;
  }

  // Interpolate endpoint, body, and query with input params
  const endpoint = interpolate(config.endpoint, input);
  const body = config.body
    ? Object.fromEntries(
        Object.entries(config.body).map(([k, v]) => [k, interpolate(v, input)]),
      )
    : undefined;
  const query = config.query
    ? Object.fromEntries(
        Object.entries(config.query).map(([k, v]) => [k, interpolate(v, input)]),
      )
    : undefined;

  const { result, logs } = await executeRest({
    service,
    restInterface,
    method: config.method,
    endpoint,
    body,
    query,
    processId,
  });

  // Check for error
  if (result && typeof result === "object" && "error" in result) {
    return `Error: ${JSON.stringify(result)}\n${logs.join("\n")}`;
  }

  return typeof result === "string" ? result : JSON.stringify(result, null, 2);
}

/**
 * Resolve a list of tool names (service.action format) into LLM tool
 * definitions and an execution dispatch function.
 *
 * Rejects tool names not found in the registry (AC-6: authorisation).
 * Returns empty tools array if no valid tools found.
 *
 * @param stagedQueue — optional staging queue (Brief 129). When provided, tools
 *   marked as `staged: true` queue their calls here instead of dispatching
 *   immediately. The agent receives `{ status: "queued", draftId }`.
 */
export function resolveTools(
  toolNames: string[],
  integrationDir?: string,
  processId?: string,
  stagedQueue?: StagedOutboundAction[],
  stepRunId?: string,
): ResolvedTools {
  const tools: LlmToolDefinition[] = [];
  // Map from qualified name (service.action) to { service, tool, executeConfig }
  const toolMap = new Map<string, { service: string; tool: IntegrationTool }>();

  // Track built-in tools for dispatch
  const builtInMap = new Map<string, BuiltInTool>();
  // Map from LLM name back to qualified name for staging lookup
  const llmNameToQualified = new Map<string, string>();

  for (const qualifiedName of toolNames) {
    // Check built-in engine tools first (e.g., knowledge.search)
    const builtIn = builtInTools[qualifiedName];
    if (builtIn) {
      tools.push(builtIn.definition);
      builtInMap.set(builtIn.definition.name, builtIn);
      llmNameToQualified.set(builtIn.definition.name, qualifiedName);
      continue;
    }

    const dotIndex = qualifiedName.indexOf(".");
    if (dotIndex === -1) {
      console.warn(`  Tool '${qualifiedName}' missing service prefix (expected service.tool_name)`);
      continue;
    }

    const service = qualifiedName.slice(0, dotIndex);
    const toolName = qualifiedName.slice(dotIndex + 1);

    const integration = getIntegration(service, integrationDir);
    if (!integration) {
      console.warn(`  Tool '${qualifiedName}': service '${service}' not in registry`);
      continue;
    }

    const integrationTool = integration.tools?.find((t) => t.name === toolName);
    if (!integrationTool) {
      console.warn(`  Tool '${qualifiedName}': tool '${toolName}' not found in service '${service}'`);
      continue;
    }

    const llmDef = toolToLlmDefinition(service, integrationTool);
    tools.push(llmDef);
    toolMap.set(qualifiedName, { service, tool: integrationTool });
  }

  const executeIntegrationTool = async (
    name: string,
    input: Record<string, unknown>,
    context?: ToolExecutionContext,
  ): Promise<string> => {
    // Check built-in tools first
    const builtIn = builtInMap.get(name);
    if (builtIn) {
      // Staged tool: queue instead of dispatching (Brief 129)
      if (builtIn.staged && stagedQueue) {
        const draftId = randomUUID();
        const qualifiedName = llmNameToQualified.get(name) ?? name;
        const meta = builtIn.extractOutboundMeta?.(input) ?? {};
        stagedQueue.push({
          toolName: qualifiedName,
          args: { ...input },
          draftId,
          content: meta.content,
          channel: meta.channel,
          recipientId: meta.recipientId,
        });
        return JSON.stringify({ status: "queued", draftId }, null, 2);
      }
      // Pass stepRunId + context for identity-aware dispatch (Brief 151, 152)
      return builtIn.execute(input, stepRunId, context);
    }

    const entry = toolMap.get(name);
    if (!entry) {
      return `Error: tool '${name}' not resolved (authorisation rejected)`;
    }

    const { service, tool } = entry;
    const config = tool.execute;

    if (config.protocol === "cli") {
      return executeCliTool(service, config, input, processId);
    } else if (config.protocol === "rest") {
      return executeRestTool(service, config as RestExecuteConfig, input, processId);
    }

    return `Error: unsupported protocol '${(config as { protocol: string }).protocol}'`;
  };

  return { tools, executeIntegrationTool };
}
