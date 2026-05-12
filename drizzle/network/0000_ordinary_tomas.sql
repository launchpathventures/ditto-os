CREATE TABLE "admin_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"feedback" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interactions" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"mode" text NOT NULL,
	"subject" text,
	"summary" text,
	"outcome" text,
	"process_run_id" text,
	"metadata" json,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "managed_workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"machine_id" text NOT NULL,
	"volume_id" text NOT NULL,
	"workspace_url" text NOT NULL,
	"region" text DEFAULT 'syd' NOT NULL,
	"image_ref" text NOT NULL,
	"current_version" text,
	"status" text DEFAULT 'provisioning' NOT NULL,
	"last_health_check_at" timestamp,
	"last_health_status" text,
	"error_log" text,
	"token_id" text NOT NULL,
	"service_id" text,
	"railway_environment_id" text,
	"auth_secret_hash" text,
	"deprovisioned_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "managed_workspaces_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "network_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp NOT NULL,
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "network_users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"handle" text,
	"business_context" text,
	"persona_assignment" text,
	"status" text DEFAULT 'active' NOT NULL,
	"workspace_id" text,
	"person_id" text,
	"workspace_suggested_at" timestamp,
	"suggestion_thread_id" text,
	"workspace_accepted_at" timestamp,
	"wants_visibility" boolean DEFAULT false NOT NULL,
	"card" json,
	"paused_at" timestamp,
	"last_notified_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "network_users_email_unique" UNIQUE("email"),
	CONSTRAINT "network_users_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"organization" text,
	"role" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"journey_layer" text DEFAULT 'participant' NOT NULL,
	"visibility" text DEFAULT 'internal' NOT NULL,
	"persona_assignment" text,
	"trust_level" text DEFAULT 'cold' NOT NULL,
	"opted_out" boolean DEFAULT false NOT NULL,
	"last_interaction_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upgrade_history" (
	"id" text PRIMARY KEY NOT NULL,
	"image_ref" text NOT NULL,
	"previous_image_ref" text,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"total_workspaces" integer NOT NULL,
	"upgraded_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"canary_workspace_id" text,
	"canary_result" text,
	"circuit_breaker_at" timestamp,
	"error_summary" text,
	"triggered_by" text NOT NULL,
	"started_at" timestamp NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "upgrade_workspace_results" (
	"id" text PRIMARY KEY NOT NULL,
	"upgrade_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"previous_image_ref" text NOT NULL,
	"result" text NOT NULL,
	"health_check_result" text,
	"error_log" text,
	"duration_ms" integer,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_feedback" ADD CONSTRAINT "admin_feedback_user_id_network_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."network_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_users" ADD CONSTRAINT "network_users_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upgrade_workspace_results" ADD CONSTRAINT "upgrade_workspace_results_upgrade_id_upgrade_history_id_fk" FOREIGN KEY ("upgrade_id") REFERENCES "public"."upgrade_history"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upgrade_workspace_results" ADD CONSTRAINT "upgrade_workspace_results_workspace_id_managed_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."managed_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_feedback_user_id" ON "admin_feedback" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "interactions_person_id" ON "interactions" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "interactions_user_id" ON "interactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "network_tokens_user_id" ON "network_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "network_tokens_hash" ON "network_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "network_users_email" ON "network_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "network_users_handle" ON "network_users" USING btree ("handle");--> statement-breakpoint
CREATE INDEX "people_user_id" ON "people" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "people_user_visibility" ON "people" USING btree ("user_id","visibility");--> statement-breakpoint
CREATE INDEX "people_email" ON "people" USING btree ("email");