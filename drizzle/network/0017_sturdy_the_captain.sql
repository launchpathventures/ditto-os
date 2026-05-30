CREATE TABLE "network_background_watches" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"request_id" text,
	"signal_id" text,
	"origin" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"paused_reason" text,
	"frequency" text DEFAULT 'weekly_digest' NOT NULL,
	"next_run_at" timestamp,
	"last_run_at" timestamp,
	"last_manual_run_at" timestamp,
	"consecutive_quiet_runs" integer DEFAULT 0 NOT NULL,
	"iana_timezone" text,
	"settings" json,
	"refinement" text,
	"close_reason" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "network_watch_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"watch_id" text NOT NULL,
	"watch_proposal_id" text,
	"kind" text NOT NULL,
	"actor_id" text,
	"reason_text" text,
	"refinement_text" text,
	"step_run_id" text NOT NULL,
	"metadata" json,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "network_watch_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"watch_id" text NOT NULL,
	"watch_run_id" text NOT NULL,
	"possible_connection_id" text NOT NULL,
	"health_decision" text NOT NULL,
	"health_reasons" json NOT NULL,
	"what_changed" text,
	"dismiss_state" text DEFAULT 'none' NOT NULL,
	"dismissed_at" timestamp,
	"shown_at" timestamp,
	"metadata" json,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "network_watch_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"watch_id" text NOT NULL,
	"search_run_id" text,
	"triggered_by" text NOT NULL,
	"outcome" text DEFAULT 'ok' NOT NULL,
	"step_run_id" text NOT NULL,
	"proposal_count" integer DEFAULT 0 NOT NULL,
	"raw_candidate_count" integer DEFAULT 0 NOT NULL,
	"health_summary" json,
	"error_summary" text,
	"started_at" timestamp NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "network_background_watches" ADD CONSTRAINT "network_background_watches_user_id_network_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."network_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_background_watches" ADD CONSTRAINT "network_background_watches_request_id_network_job_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."network_job_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_background_watches" ADD CONSTRAINT "network_background_watches_signal_id_network_member_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."network_member_signals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_watch_feedback" ADD CONSTRAINT "network_watch_feedback_watch_id_network_background_watches_id_fk" FOREIGN KEY ("watch_id") REFERENCES "public"."network_background_watches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_watch_feedback" ADD CONSTRAINT "network_watch_feedback_watch_proposal_id_network_watch_proposals_id_fk" FOREIGN KEY ("watch_proposal_id") REFERENCES "public"."network_watch_proposals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_watch_proposals" ADD CONSTRAINT "network_watch_proposals_watch_id_network_background_watches_id_fk" FOREIGN KEY ("watch_id") REFERENCES "public"."network_background_watches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_watch_proposals" ADD CONSTRAINT "network_watch_proposals_watch_run_id_network_watch_runs_id_fk" FOREIGN KEY ("watch_run_id") REFERENCES "public"."network_watch_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_watch_proposals" ADD CONSTRAINT "network_watch_proposals_possible_connection_id_network_possible_connections_id_fk" FOREIGN KEY ("possible_connection_id") REFERENCES "public"."network_possible_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_watch_runs" ADD CONSTRAINT "network_watch_runs_watch_id_network_background_watches_id_fk" FOREIGN KEY ("watch_id") REFERENCES "public"."network_background_watches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_watch_runs" ADD CONSTRAINT "network_watch_runs_search_run_id_network_search_runs_id_fk" FOREIGN KEY ("search_run_id") REFERENCES "public"."network_search_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "network_background_watches_user_id" ON "network_background_watches" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "network_background_watches_status" ON "network_background_watches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "network_background_watches_next_run_at" ON "network_background_watches" USING btree ("next_run_at");--> statement-breakpoint
CREATE INDEX "network_background_watches_request_id" ON "network_background_watches" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "network_background_watches_signal_id" ON "network_background_watches" USING btree ("signal_id");--> statement-breakpoint
CREATE INDEX "network_watch_feedback_watch_id" ON "network_watch_feedback" USING btree ("watch_id");--> statement-breakpoint
CREATE INDEX "network_watch_feedback_proposal_id" ON "network_watch_feedback" USING btree ("watch_proposal_id");--> statement-breakpoint
CREATE INDEX "network_watch_feedback_kind" ON "network_watch_feedback" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "network_watch_proposals_watch_id" ON "network_watch_proposals" USING btree ("watch_id");--> statement-breakpoint
CREATE INDEX "network_watch_proposals_watch_run_id" ON "network_watch_proposals" USING btree ("watch_run_id");--> statement-breakpoint
CREATE INDEX "network_watch_proposals_connection_id" ON "network_watch_proposals" USING btree ("possible_connection_id");--> statement-breakpoint
CREATE INDEX "network_watch_proposals_dismiss_state" ON "network_watch_proposals" USING btree ("dismiss_state");--> statement-breakpoint
CREATE UNIQUE INDEX "network_watch_proposals_run_connection_uq" ON "network_watch_proposals" USING btree ("watch_run_id","possible_connection_id");--> statement-breakpoint
CREATE INDEX "network_watch_runs_watch_id" ON "network_watch_runs" USING btree ("watch_id");--> statement-breakpoint
CREATE INDEX "network_watch_runs_started_at" ON "network_watch_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "network_watch_runs_outcome" ON "network_watch_runs" USING btree ("outcome");