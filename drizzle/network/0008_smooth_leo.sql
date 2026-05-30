CREATE TABLE "network_possible_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"search_run_id" text NOT NULL,
	"user_id" text,
	"visitor_session_id" text,
	"source" text NOT NULL,
	"person_id" text,
	"display_name" text NOT NULL,
	"headline" text NOT NULL,
	"canonical_url" text,
	"is_ditto_member" boolean DEFAULT false NOT NULL,
	"why_this_fits" text NOT NULL,
	"why_now" text,
	"evidence" json NOT NULL,
	"risks" json NOT NULL,
	"confidence" text DEFAULT 'medium' NOT NULL,
	"network_health_flags" json NOT NULL,
	"next_action" text NOT NULL,
	"intro_eligibility" text NOT NULL,
	"lifecycle_state" text DEFAULT 'proposed' NOT NULL,
	"saved_to_request_id" text,
	"scrub_applied" boolean DEFAULT false NOT NULL,
	"metadata" json,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "network_search_audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"search_run_id" text,
	"possible_connection_id" text,
	"event_type" text NOT NULL,
	"actor_id" text,
	"step_run_id" text NOT NULL,
	"target_lifecycle_state" text,
	"scrub_decision" json,
	"before" json,
	"after" json,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "network_search_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"search_run_id" text NOT NULL,
	"possible_connection_id" text,
	"actor_id" text,
	"step_run_id" text NOT NULL,
	"kind" text NOT NULL,
	"reason_text" text,
	"refinement_text" text,
	"metadata" json,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "network_search_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"visitor_session_id" text,
	"actor_id" text,
	"session_id" text,
	"step_run_id" text NOT NULL,
	"mode" text DEFAULT 'both' NOT NULL,
	"sources_allowed" text DEFAULT 'both' NOT NULL,
	"query" text NOT NULL,
	"refinement" text,
	"request_id" text,
	"member_signal_id" text,
	"result_count" integer DEFAULT 0 NOT NULL,
	"web_search_available" boolean DEFAULT true NOT NULL,
	"partial" boolean DEFAULT false NOT NULL,
	"metadata" json,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "network_possible_connections" ADD CONSTRAINT "network_possible_connections_search_run_id_network_search_runs_id_fk" FOREIGN KEY ("search_run_id") REFERENCES "public"."network_search_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_possible_connections" ADD CONSTRAINT "network_possible_connections_user_id_network_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."network_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_possible_connections" ADD CONSTRAINT "network_possible_connections_saved_to_request_id_network_job_requests_id_fk" FOREIGN KEY ("saved_to_request_id") REFERENCES "public"."network_job_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_search_audit_events" ADD CONSTRAINT "network_search_audit_events_search_run_id_network_search_runs_id_fk" FOREIGN KEY ("search_run_id") REFERENCES "public"."network_search_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_search_audit_events" ADD CONSTRAINT "network_search_audit_events_possible_connection_id_network_possible_connections_id_fk" FOREIGN KEY ("possible_connection_id") REFERENCES "public"."network_possible_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_search_feedback" ADD CONSTRAINT "network_search_feedback_search_run_id_network_search_runs_id_fk" FOREIGN KEY ("search_run_id") REFERENCES "public"."network_search_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_search_feedback" ADD CONSTRAINT "network_search_feedback_possible_connection_id_network_possible_connections_id_fk" FOREIGN KEY ("possible_connection_id") REFERENCES "public"."network_possible_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_search_runs" ADD CONSTRAINT "network_search_runs_user_id_network_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."network_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_search_runs" ADD CONSTRAINT "network_search_runs_request_id_network_job_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."network_job_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_search_runs" ADD CONSTRAINT "network_search_runs_member_signal_id_network_member_signals_id_fk" FOREIGN KEY ("member_signal_id") REFERENCES "public"."network_member_signals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "network_possible_connections_search_run_id" ON "network_possible_connections" USING btree ("search_run_id");--> statement-breakpoint
CREATE INDEX "network_possible_connections_user_id" ON "network_possible_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "network_possible_connections_lifecycle" ON "network_possible_connections" USING btree ("lifecycle_state");--> statement-breakpoint
CREATE INDEX "network_possible_connections_saved_request" ON "network_possible_connections" USING btree ("saved_to_request_id");--> statement-breakpoint
CREATE INDEX "network_search_audit_events_search_run_id" ON "network_search_audit_events" USING btree ("search_run_id");--> statement-breakpoint
CREATE INDEX "network_search_audit_events_connection_id" ON "network_search_audit_events" USING btree ("possible_connection_id");--> statement-breakpoint
CREATE INDEX "network_search_audit_events_type" ON "network_search_audit_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "network_search_feedback_search_run_id" ON "network_search_feedback" USING btree ("search_run_id");--> statement-breakpoint
CREATE INDEX "network_search_feedback_connection_id" ON "network_search_feedback" USING btree ("possible_connection_id");--> statement-breakpoint
CREATE INDEX "network_search_feedback_kind" ON "network_search_feedback" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "network_search_runs_user_id" ON "network_search_runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "network_search_runs_visitor_session_id" ON "network_search_runs" USING btree ("visitor_session_id");--> statement-breakpoint
CREATE INDEX "network_search_runs_request_id" ON "network_search_runs" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "network_search_runs_created_at" ON "network_search_runs" USING btree ("created_at");