PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_work_items` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text DEFAULT 'task' NOT NULL,
	`status` text DEFAULT 'intake' NOT NULL,
	`content` text NOT NULL,
	`source` text DEFAULT 'capture' NOT NULL,
	`goal_ancestry` text DEFAULT '[]',
	`assigned_process` text,
	`spawned_from` text,
	`spawned_items` text DEFAULT '[]',
	`decomposition` text,
	`execution_ids` text DEFAULT '[]',
	`context` text DEFAULT '{}',
	`runner_override` text,
	`runner_mode_required` text,
	`project_id` text,
	`title` text,
	`body` text,
	`brief_state` text,
	`risk_score` integer,
	`confidence` real,
	`model_assignment` text,
	`linked_capture_id` text,
	`linked_process_run_id` text,
	`state_changed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`assigned_process`) REFERENCES `processes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`linked_process_run_id`) REFERENCES `process_runs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "work_items_title_or_content" CHECK(("__new_work_items"."title" IS NULL AND "__new_work_items"."content" IS NOT NULL) OR ("__new_work_items"."title" IS NOT NULL AND "__new_work_items"."body" IS NOT NULL)),
	CONSTRAINT "work_items_project_id_partitions_brief_state" CHECK(("__new_work_items"."project_id" IS NULL AND "__new_work_items"."brief_state" IS NULL) OR ("__new_work_items"."project_id" IS NOT NULL))
);
--> statement-breakpoint
-- Brief 223: only project OLD work_items columns; the 10 new columns
-- (project_id, title, body, brief_state, risk_score, confidence,
-- model_assignment, linked_capture_id, linked_process_run_id, state_changed_at)
-- default to NULL on existing rows. Drizzle-kit emits the new columns in the
-- INSERT by default (see Insight-190 quirk); manual edit per the brief's
-- "builder must read the generated SQL and manually re-order statements if
-- needed" rule (Brief 223 §Constraints).
INSERT INTO `__new_work_items`("id", "type", "status", "content", "source", "goal_ancestry", "assigned_process", "spawned_from", "spawned_items", "decomposition", "execution_ids", "context", "runner_override", "runner_mode_required", "created_at", "updated_at", "completed_at") SELECT "id", "type", "status", "content", "source", "goal_ancestry", "assigned_process", "spawned_from", "spawned_items", "decomposition", "execution_ids", "context", "runner_override", "runner_mode_required", "created_at", "updated_at", "completed_at" FROM `work_items`;--> statement-breakpoint
DROP TABLE `work_items`;--> statement-breakpoint
ALTER TABLE `__new_work_items` RENAME TO `work_items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `work_items_project_idx` ON `work_items` (`project_id`);--> statement-breakpoint
CREATE INDEX `work_items_brief_state_idx` ON `work_items` (`brief_state`);