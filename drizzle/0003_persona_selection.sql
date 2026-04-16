ALTER TABLE `chat_sessions` ADD `persona_id` text;--> statement-breakpoint
ALTER TABLE `chat_sessions` ADD `stage` text DEFAULT 'picker' NOT NULL;--> statement-breakpoint
ALTER TABLE `chat_sessions` ADD `interview_transcripts` text;--> statement-breakpoint
-- Back-compat: any pre-existing chat sessions were on the Alex-only flow. Treat
-- them as committed to Alex so the main front door keeps working for returning
-- visitors without a picker loop.
UPDATE `chat_sessions` SET `persona_id` = 'alex', `stage` = 'main'
  WHERE `persona_id` IS NULL;