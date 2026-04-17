ALTER TABLE `process_runs` ADD `stale_escalation_tier` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `process_runs` ADD `stale_escalation_last_action_at` integer;