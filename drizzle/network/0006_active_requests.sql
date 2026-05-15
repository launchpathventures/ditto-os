ALTER TABLE "network_job_requests" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "network_job_requests" ADD COLUMN "visitor_session_id" text;--> statement-breakpoint
ALTER TABLE "network_job_requests" ADD COLUMN "mode" text DEFAULT 'manual-search' NOT NULL;--> statement-breakpoint
ALTER TABLE "network_job_requests" ADD COLUMN "raw_need" text;--> statement-breakpoint
ALTER TABLE "network_job_requests" ADD COLUMN "outcome_needed" text;--> statement-breakpoint
ALTER TABLE "network_job_requests" ADD COLUMN "ideal_person" text;--> statement-breakpoint
ALTER TABLE "network_job_requests" ADD COLUMN "proof_required" text;--> statement-breakpoint
ALTER TABLE "network_job_requests" ADD COLUMN "bad_fit" text;--> statement-breakpoint
ALTER TABLE "network_job_requests" ADD COLUMN "urgency" text;--> statement-breakpoint
ALTER TABLE "network_job_requests" ADD COLUMN "geography" text;--> statement-breakpoint
ALTER TABLE "network_job_requests" ADD COLUMN "commercial_shape" text;--> statement-breakpoint
ALTER TABLE "network_job_requests" ADD COLUMN "success_outcome" text;--> statement-breakpoint
ALTER TABLE "network_job_requests" ADD COLUMN "outcome_value_hint" text;--> statement-breakpoint
ALTER TABLE "network_job_requests" ADD COLUMN "budget_private" text;--> statement-breakpoint
ALTER TABLE "network_job_requests" ADD COLUMN "budget_shareable_label" text;--> statement-breakpoint
ALTER TABLE "network_job_requests" ADD COLUMN "shareable_summary" text;--> statement-breakpoint
ALTER TABLE "network_job_requests" ADD COLUMN "private_notes" text;--> statement-breakpoint
ALTER TABLE "network_job_requests" ADD COLUMN "sources_allowed" text DEFAULT 'both' NOT NULL;--> statement-breakpoint
ALTER TABLE "network_job_requests" ADD COLUMN "contact_policy" text DEFAULT 'ask-before-contact' NOT NULL;--> statement-breakpoint
ALTER TABLE "network_job_requests" ADD COLUMN "requester_name" text;--> statement-breakpoint
ALTER TABLE "network_job_requests" ADD COLUMN "requester_email" text;--> statement-breakpoint
ALTER TABLE "network_job_requests" ADD COLUMN "requester_org_site" text;--> statement-breakpoint
ALTER TABLE "network_job_requests" ADD COLUMN "requester_credibility" text;--> statement-breakpoint
ALTER TABLE "network_job_requests" ADD COLUMN "search_handoff" json;--> statement-breakpoint
ALTER TABLE "network_job_requests" ADD COLUMN "watch_handoff" json;--> statement-breakpoint
CREATE TABLE "network_request_audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"event_type" text NOT NULL,
	"actor_id" text,
	"step_run_id" text NOT NULL,
	"before" json,
	"after" json,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "network_request_audit_events" ADD CONSTRAINT "network_request_audit_events_request_id_network_job_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."network_job_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "network_job_requests_visitor_session_id" ON "network_job_requests" USING btree ("visitor_session_id");--> statement-breakpoint
CREATE INDEX "network_job_requests_mode" ON "network_job_requests" USING btree ("mode");--> statement-breakpoint
CREATE INDEX "network_request_audit_events_request_id" ON "network_request_audit_events" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "network_request_audit_events_event_type" ON "network_request_audit_events" USING btree ("event_type");
