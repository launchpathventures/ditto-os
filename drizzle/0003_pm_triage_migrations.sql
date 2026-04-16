CREATE TABLE `process_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`process_id` text NOT NULL,
	`version` integer NOT NULL,
	`definition` text NOT NULL,
	`change_summary` text,
	`edited_by` text DEFAULT 'self',
	`created_at` integer NOT NULL,
	FOREIGN KEY (`process_id`) REFERENCES `processes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `process_versions_process_id_version_unique` ON `process_versions` (`process_id`,`version`);--> statement-breakpoint
CREATE TABLE `workspace_views` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`slug` text NOT NULL,
	`label` text NOT NULL,
	`icon` text,
	`description` text,
	`schema` text NOT NULL,
	`source_process_id` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`source_process_id`) REFERENCES `processes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_views_workspace_id_slug_unique` ON `workspace_views` (`workspace_id`,`slug`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`process_id` text,
	`user_id` text,
	`service` text NOT NULL,
	`encrypted_value` text NOT NULL,
	`iv` text NOT NULL,
	`auth_tag` text NOT NULL,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`process_id`) REFERENCES `processes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_credentials`("id", "process_id", "user_id", "service", "encrypted_value", "iv", "auth_tag", "expires_at", "created_at") SELECT "id", "process_id", "user_id", "service", "encrypted_value", "iv", "auth_tag", "expires_at", "created_at" FROM `credentials`;--> statement-breakpoint
DROP TABLE `credentials`;--> statement-breakpoint
ALTER TABLE `__new_credentials` RENAME TO `credentials`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `credentials_process_service_unique` ON `credentials` (`process_id`,`service`);--> statement-breakpoint
CREATE UNIQUE INDEX `credentials_user_service_unique` ON `credentials` (`user_id`,`service`);--> statement-breakpoint
ALTER TABLE `network_users` ADD `suggestion_thread_id` text;--> statement-breakpoint
ALTER TABLE `network_users` ADD `workspace_accepted_at` integer;