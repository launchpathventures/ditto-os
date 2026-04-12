CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`description` text,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`entity_type` text,
	`entity_id` text,
	`metadata` text DEFAULT '{}',
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `admin_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`feedback` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `network_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `admin_feedback_user_id` ON `admin_feedback` (`user_id`);--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'idle' NOT NULL,
	`adapter_type` text NOT NULL,
	`adapter_config` text DEFAULT '{}' NOT NULL,
	`monthly_budget_cents` integer,
	`current_spend_cents` integer DEFAULT 0 NOT NULL,
	`budget_reset_at` integer,
	`total_runs` integer DEFAULT 0 NOT NULL,
	`success_rate` real,
	`category` text DEFAULT 'domain' NOT NULL,
	`system_role` text,
	`owner_id` text,
	`organisation_id` text,
	`permissions` text,
	`provenance` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `briefs` (
	`number` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`depends_on` text,
	`unlocks` text,
	`file_path` text,
	`last_modified` integer,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `budget_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`budget_id` text NOT NULL,
	`type` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`description` text,
	`sub_goal_id` text,
	`stripe_payment_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`budget_id`) REFERENCES `budgets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_work_item_id` text NOT NULL,
	`user_id` text NOT NULL,
	`total_cents` integer NOT NULL,
	`spent_cents` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'created' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`goal_work_item_id`) REFERENCES `work_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_goal_work_item_id_unique` ON `budgets` (`goal_work_item_id`);--> statement-breakpoint
CREATE TABLE `chat_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`messages` text NOT NULL,
	`context` text NOT NULL,
	`ip_hash` text NOT NULL,
	`request_email_flagged` integer DEFAULT false NOT NULL,
	`message_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`authenticated_email` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_sessions_session_id_unique` ON `chat_sessions` (`session_id`);--> statement-breakpoint
CREATE TABLE `credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`process_id` text NOT NULL,
	`service` text NOT NULL,
	`encrypted_value` text NOT NULL,
	`iv` text NOT NULL,
	`auth_tag` text NOT NULL,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`process_id`) REFERENCES `processes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credentials_process_service_unique` ON `credentials` (`process_id`,`service`);--> statement-breakpoint
CREATE TABLE `delayed_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`process_slug` text NOT NULL,
	`inputs` text DEFAULT '{}' NOT NULL,
	`execute_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_by_run_id` text,
	`parent_trust_tier` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by_run_id`) REFERENCES `process_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `document_content` (
	`id` text PRIMARY KEY NOT NULL,
	`document_hash` text NOT NULL,
	`parsed_markdown` text NOT NULL,
	`page_count` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_content_document_hash_unique` ON `document_content` (`document_hash`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`file_path` text NOT NULL,
	`file_name` text NOT NULL,
	`format` text NOT NULL,
	`content_hash` text NOT NULL,
	`chunk_count` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'local' NOT NULL,
	`last_indexed` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `email_verification_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`email` text NOT NULL,
	`code` text NOT NULL,
	`verified` integer DEFAULT false NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`output_id` text NOT NULL,
	`process_id` text NOT NULL,
	`type` text NOT NULL,
	`diff` text,
	`comment` text,
	`edit_severity` text,
	`edit_ratio` real,
	`correction_pattern` text,
	`pattern_confidence` real,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`output_id`) REFERENCES `process_outputs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`process_id`) REFERENCES `processes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `funnel_events` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`event` text NOT NULL,
	`surface` text NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `harness_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`process_run_id` text NOT NULL,
	`step_run_id` text NOT NULL,
	`trust_tier` text NOT NULL,
	`trust_action` text NOT NULL,
	`review_pattern` text DEFAULT '[]' NOT NULL,
	`review_result` text DEFAULT 'skip' NOT NULL,
	`review_details` text DEFAULT '{}',
	`review_cost_cents` integer DEFAULT 0 NOT NULL,
	`memories_injected` integer DEFAULT 0 NOT NULL,
	`sampling_hash` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`process_run_id`) REFERENCES `process_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`step_run_id`) REFERENCES `step_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `improvements` (
	`id` text PRIMARY KEY NOT NULL,
	`process_id` text NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`evidence` text NOT NULL,
	`estimated_impact` text,
	`estimated_effort` text,
	`risk` text,
	`confidence` real,
	`decided_at` integer,
	`decided_by` text,
	`decision_comment` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`process_id`) REFERENCES `processes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `interaction_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`event_type` text NOT NULL,
	`entity_id` text,
	`properties` text DEFAULT '{}',
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `interaction_events_user_timestamp` ON `interaction_events` (`user_id`,`timestamp`);--> statement-breakpoint
CREATE TABLE `interactions` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`channel` text DEFAULT 'email' NOT NULL,
	`mode` text NOT NULL,
	`subject` text,
	`summary` text,
	`outcome` text,
	`process_run_id` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`process_run_id`) REFERENCES `process_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `interactions_person_id` ON `interactions` (`person_id`);--> statement-breakpoint
CREATE INDEX `interactions_user_id` ON `interactions` (`user_id`);--> statement-breakpoint
CREATE TABLE `magic_links` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`token` text NOT NULL,
	`session_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `magic_links_token_unique` ON `magic_links` (`token`);--> statement-breakpoint
CREATE TABLE `managed_workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`machine_id` text NOT NULL,
	`volume_id` text NOT NULL,
	`workspace_url` text NOT NULL,
	`region` text DEFAULT 'syd' NOT NULL,
	`image_ref` text NOT NULL,
	`current_version` text,
	`status` text DEFAULT 'provisioning' NOT NULL,
	`last_health_check_at` integer,
	`last_health_status` text,
	`error_log` text,
	`token_id` text NOT NULL,
	`service_id` text,
	`railway_environment_id` text,
	`auth_secret_hash` text,
	`deprovisioned_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `managed_workspaces_user_id_unique` ON `managed_workspaces` (`user_id`);--> statement-breakpoint
CREATE TABLE `memories` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`metadata` text,
	`source` text NOT NULL,
	`source_id` text,
	`reinforcement_count` integer DEFAULT 1 NOT NULL,
	`last_reinforced_at` integer NOT NULL,
	`confidence` real DEFAULT 0.3 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`shared` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `network_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`is_admin` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE INDEX `network_tokens_user_id` ON `network_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `network_tokens_hash` ON `network_tokens` (`token_hash`);--> statement-breakpoint
CREATE TABLE `network_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`business_context` text,
	`persona_assignment` text,
	`status` text DEFAULT 'active' NOT NULL,
	`workspace_id` text,
	`person_id` text,
	`workspace_suggested_at` integer,
	`wants_visibility` integer DEFAULT false NOT NULL,
	`paused_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `network_users_email_unique` ON `network_users` (`email`);--> statement-breakpoint
CREATE INDEX `network_users_email` ON `network_users` (`email`);--> statement-breakpoint
CREATE TABLE `outbound_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`process_run_id` text NOT NULL,
	`step_run_id` text NOT NULL,
	`channel` text NOT NULL,
	`sending_identity` text NOT NULL,
	`recipient_id` text,
	`content_summary` text,
	`blocked` integer DEFAULT false NOT NULL,
	`block_reason` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`process_run_id`) REFERENCES `process_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`step_run_id`) REFERENCES `step_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`organization` text,
	`role` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`journey_layer` text DEFAULT 'participant' NOT NULL,
	`visibility` text DEFAULT 'internal' NOT NULL,
	`persona_assignment` text,
	`trust_level` text DEFAULT 'cold' NOT NULL,
	`opted_out` integer DEFAULT false NOT NULL,
	`last_interaction_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `people_user_id` ON `people` (`user_id`);--> statement-breakpoint
CREATE INDEX `people_user_visibility` ON `people` (`user_id`,`visibility`);--> statement-breakpoint
CREATE INDEX `people_email` ON `people` (`email`);--> statement-breakpoint
CREATE TABLE `process_dependencies` (
	`id` text PRIMARY KEY NOT NULL,
	`source_process_id` text NOT NULL,
	`target_process_id` text NOT NULL,
	`output_name` text NOT NULL,
	`input_name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`source_process_id`) REFERENCES `processes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_process_id`) REFERENCES `processes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `process_models` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`industry_tags` text DEFAULT '[]',
	`function_tags` text DEFAULT '[]',
	`complexity` text DEFAULT 'moderate' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'nominated' NOT NULL,
	`source` text DEFAULT 'template' NOT NULL,
	`process_definition` text NOT NULL,
	`quality_criteria` text DEFAULT '[]',
	`validation_report` text,
	`nominated_by` text,
	`approved_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`published_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `process_models_slug_unique` ON `process_models` (`slug`);--> statement-breakpoint
CREATE TABLE `process_outputs` (
	`id` text PRIMARY KEY NOT NULL,
	`process_run_id` text NOT NULL,
	`step_run_id` text,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`content_url` text,
	`needs_review` integer DEFAULT true NOT NULL,
	`reviewed_at` integer,
	`reviewed_by` text,
	`confidence_score` real,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`process_run_id`) REFERENCES `process_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`step_run_id`) REFERENCES `step_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `process_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`process_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`triggered_by` text NOT NULL,
	`inputs` text DEFAULT '{}',
	`current_step_id` text,
	`started_at` integer,
	`completed_at` integer,
	`total_tokens` integer DEFAULT 0,
	`total_cost_cents` integer DEFAULT 0,
	`suspend_state` text,
	`orchestrator_confidence` text,
	`definition_override` text,
	`definition_override_version` integer DEFAULT 0 NOT NULL,
	`chains_processed` integer DEFAULT false NOT NULL,
	`trust_tier_override` text,
	`cycle_type` text,
	`cycle_config` text,
	`parent_cycle_run_id` text,
	`run_metadata` text,
	`timeout_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`process_id`) REFERENCES `processes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `processes` (
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
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `processes_slug_unique` ON `processes` (`slug`);--> statement-breakpoint
CREATE TABLE `review_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`person_id` text NOT NULL,
	`token` text NOT NULL,
	`title` text NOT NULL,
	`content_blocks` text NOT NULL,
	`chat_messages` text,
	`status` text DEFAULT 'active' NOT NULL,
	`user_name` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`completed_at` integer,
	`first_accessed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_pages_token_unique` ON `review_pages` (`token`);--> statement-breakpoint
CREATE TABLE `schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`process_id` text NOT NULL,
	`cron_expression` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_run_at` integer,
	`next_run_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`process_id`) REFERENCES `processes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`surface` text NOT NULL,
	`started_at` integer NOT NULL,
	`last_active_at` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`summary` text,
	`turns` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `slm_deployments` (
	`id` text PRIMARY KEY NOT NULL,
	`process_slug` text NOT NULL,
	`step_id` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`status` text DEFAULT 'candidate' NOT NULL,
	`training_export_id` text,
	`eval_accuracy` real,
	`eval_f1` real,
	`eval_examples` integer,
	`production_run_count` integer DEFAULT 0,
	`production_approval_rate` real,
	`baseline_approval_rate` real,
	`retired_reason` text,
	`created_at` integer NOT NULL,
	`promoted_at` integer,
	`retired_at` integer,
	FOREIGN KEY (`training_export_id`) REFERENCES `slm_training_exports`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `slm_training_exports` (
	`id` text PRIMARY KEY NOT NULL,
	`process_slug` text NOT NULL,
	`step_id` text NOT NULL,
	`purpose` text NOT NULL,
	`example_count` integer DEFAULT 0 NOT NULL,
	`format` text DEFAULT 'jsonl' NOT NULL,
	`export_path` text NOT NULL,
	`scrubber_used` text DEFAULT 'none' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `step_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`process_run_id` text NOT NULL,
	`step_id` text NOT NULL,
	`agent_id` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`executor_type` text NOT NULL,
	`inputs` text DEFAULT '{}',
	`outputs` text DEFAULT '{}',
	`parallel_group_id` text,
	`started_at` integer,
	`completed_at` integer,
	`tokens_used` integer DEFAULT 0,
	`cost_cents` integer DEFAULT 0,
	`error` text,
	`confidence_level` text,
	`model` text,
	`integration_service` text,
	`integration_protocol` text,
	`tool_calls` text,
	`cognitive_mode` text,
	`deferred_until` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`process_run_id`) REFERENCES `process_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `suggestion_dismissals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`suggestion_type` text NOT NULL,
	`content_hash` text NOT NULL,
	`content` text NOT NULL,
	`dismissed_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `suggestion_dismissals_user_expires` ON `suggestion_dismissals` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `trust_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`process_id` text NOT NULL,
	`from_tier` text NOT NULL,
	`to_tier` text NOT NULL,
	`reason` text NOT NULL,
	`actor` text NOT NULL,
	`metadata` text DEFAULT '{}',
	`created_at` integer NOT NULL,
	FOREIGN KEY (`process_id`) REFERENCES `processes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `trust_suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`process_id` text NOT NULL,
	`current_tier` text NOT NULL,
	`suggested_tier` text NOT NULL,
	`evidence` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`decided_at` integer,
	`decided_by` text,
	`decision_comment` text,
	`previous_suggestion_id` text,
	`step_category` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`process_id`) REFERENCES `processes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `upgrade_history` (
	`id` text PRIMARY KEY NOT NULL,
	`image_ref` text NOT NULL,
	`previous_image_ref` text,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`total_workspaces` integer NOT NULL,
	`upgraded_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`skipped_count` integer DEFAULT 0 NOT NULL,
	`canary_workspace_id` text,
	`canary_result` text,
	`circuit_breaker_at` integer,
	`error_summary` text,
	`triggered_by` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE TABLE `upgrade_workspace_results` (
	`id` text PRIMARY KEY NOT NULL,
	`upgrade_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`previous_image_ref` text NOT NULL,
	`result` text NOT NULL,
	`health_check_result` text,
	`error_log` text,
	`duration_ms` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`upgrade_id`) REFERENCES `upgrade_history`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`) REFERENCES `managed_workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `verification_emails` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_email` text NOT NULL,
	`sent_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `verify_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`ip_hash` text NOT NULL,
	`email` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `work_items` (
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
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`assigned_process`) REFERENCES `processes`(`id`) ON UPDATE no action ON DELETE no action
);
