CREATE TABLE `bridge_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`device_name` text NOT NULL,
	`jwt_token_hash` text NOT NULL,
	`protocol_version` text DEFAULT '1.0.0' NOT NULL,
	`paired_at` integer NOT NULL,
	`last_dial_at` integer,
	`last_ip` text,
	`status` text DEFAULT 'active' NOT NULL,
	`revoked_at` integer,
	`revoked_reason` text
);
--> statement-breakpoint
CREATE INDEX `bridge_devices_workspace_idx` ON `bridge_devices` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `bridge_devices_status_idx` ON `bridge_devices` (`workspace_id`,`status`);--> statement-breakpoint
CREATE TABLE `bridge_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`requested_device_id` text,
	`routed_as` text DEFAULT 'primary' NOT NULL,
	`process_run_id` text NOT NULL,
	`step_run_id` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`queued_at` integer NOT NULL,
	`dispatched_at` integer,
	`completed_at` integer,
	`last_heartbeat_at` integer,
	`exit_code` integer,
	`stdout_bytes` integer DEFAULT 0 NOT NULL,
	`stderr_bytes` integer DEFAULT 0 NOT NULL,
	`truncated` integer DEFAULT false NOT NULL,
	`termination_signal` text,
	`error_message` text,
	FOREIGN KEY (`device_id`) REFERENCES `bridge_devices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requested_device_id`) REFERENCES `bridge_devices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`process_run_id`) REFERENCES `process_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`step_run_id`) REFERENCES `step_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bridge_jobs_device_state_idx` ON `bridge_jobs` (`device_id`,`state`);--> statement-breakpoint
CREATE INDEX `bridge_jobs_step_run_idx` ON `bridge_jobs` (`step_run_id`);--> statement-breakpoint
CREATE INDEX `bridge_jobs_heartbeat_idx` ON `bridge_jobs` (`state`,`last_heartbeat_at`);--> statement-breakpoint
CREATE TABLE `bridge_pairing_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`device_name_hint` text,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`consumed_device_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`consumed_device_id`) REFERENCES `bridge_devices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bridge_pairing_codes_workspace_idx` ON `bridge_pairing_codes` (`workspace_id`);