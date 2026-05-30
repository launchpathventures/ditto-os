CREATE TABLE "network_audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_class" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"reason_code" text,
	"metadata" jsonb,
	"step_run_id" text NOT NULL,
	"prev_hash" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "network_audit_events_class_created_at" ON "network_audit_events" USING btree ("event_class","created_at");--> statement-breakpoint
CREATE INDEX "network_audit_events_subject" ON "network_audit_events" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "network_audit_events_actor" ON "network_audit_events" USING btree ("actor_type","actor_id");