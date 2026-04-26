CREATE TABLE `project_runners` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`mode` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`config_json` text DEFAULT '{}' NOT NULL,
	`credential_ids` text DEFAULT '[]' NOT NULL,
	`last_health_check_at` integer,
	`last_health_status` text DEFAULT 'unknown' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_runners_project_kind_unique` ON `project_runners` (`project_id`,`kind`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`github_repo` text,
	`default_branch` text DEFAULT 'main' NOT NULL,
	`harness_type` text DEFAULT 'none' NOT NULL,
	`brief_source` text,
	`brief_path` text,
	`default_runner_kind` text,
	`fallback_runner_kind` text,
	`runner_chain` text,
	`deploy_target` text,
	`status` text DEFAULT 'analysing' NOT NULL,
	`runner_bearer_hash` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_slug_unique` ON `projects` (`slug`);--> statement-breakpoint
CREATE INDEX `projects_status_idx` ON `projects` (`status`);--> statement-breakpoint
CREATE TABLE `runner_dispatches` (
	`id` text PRIMARY KEY NOT NULL,
	`work_item_id` text NOT NULL,
	`project_id` text NOT NULL,
	`runner_kind` text NOT NULL,
	`runner_mode` text NOT NULL,
	`external_run_id` text,
	`external_url` text,
	`attempt_index` integer DEFAULT 0 NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`status` text DEFAULT 'queued' NOT NULL,
	`error_reason` text,
	`step_run_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`work_item_id`) REFERENCES `work_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`step_run_id`) REFERENCES `step_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `runner_dispatches_work_item_idx` ON `runner_dispatches` (`work_item_id`);--> statement-breakpoint
CREATE INDEX `runner_dispatches_project_idx` ON `runner_dispatches` (`project_id`);--> statement-breakpoint
CREATE INDEX `runner_dispatches_status_idx` ON `runner_dispatches` (`status`);--> statement-breakpoint
ALTER TABLE `work_items` ADD `runner_override` text;--> statement-breakpoint
ALTER TABLE `work_items` ADD `runner_mode_required` text;--> statement-breakpoint
-- Brief 215 AC #2: NULL out orphaned processes.project_id values before
-- tightening to FK. The projects table is empty at this point, so any
-- pre-existing non-null project_id is an orphan.
UPDATE `processes` SET `project_id` = NULL WHERE `project_id` IS NOT NULL AND `project_id` NOT IN (SELECT `id` FROM `projects`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_processes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`definition` text NOT NULL,
	`trust_tier` text DEFAULT 'supervised' NOT NULL,
	`trust_data` text DEFAULT '{}',
	`source` text,
	`output_delivery` text,
	`project_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_processes`("id", "name", "slug", "description", "version", "status", "definition", "trust_tier", "trust_data", "source", "output_delivery", "project_id", "created_at", "updated_at") SELECT "id", "name", "slug", "description", "version", "status", "definition", "trust_tier", "trust_data", "source", "output_delivery", "project_id", "created_at", "updated_at" FROM `processes`;--> statement-breakpoint
DROP TABLE `processes`;--> statement-breakpoint
ALTER TABLE `__new_processes` RENAME TO `processes`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `processes_slug_unique` ON `processes` (`slug`);