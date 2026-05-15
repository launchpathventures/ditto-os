CREATE TABLE "network_member_signals" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"source_summary" text,
	"calibration_questions" json,
	"approved_at" timestamp,
	"published_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "network_member_signals_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "network_signal_claims" (
	"id" text PRIMARY KEY NOT NULL,
	"member_signal_id" text NOT NULL,
	"user_id" text NOT NULL,
	"source_id" text NOT NULL,
	"kb_fact_id" text,
	"section" text NOT NULL,
	"claim_text" text NOT NULL,
	"source_type" text NOT NULL,
	"source_label" text NOT NULL,
	"source_url" text,
	"evidence_snippet" text NOT NULL,
	"confidence" text DEFAULT 'medium' NOT NULL,
	"visibility" text DEFAULT 'on-request' NOT NULL,
	"approval_state" text DEFAULT 'suggested' NOT NULL,
	"metadata" json,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "network_signal_review_events" (
	"id" text PRIMARY KEY NOT NULL,
	"member_signal_id" text NOT NULL,
	"claim_id" text,
	"user_id" text NOT NULL,
	"event_type" text NOT NULL,
	"actor_id" text,
	"step_run_id" text NOT NULL,
	"before" json,
	"after" json,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "network_signal_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"member_signal_id" text NOT NULL,
	"user_id" text NOT NULL,
	"source_type" text NOT NULL,
	"source_label" text NOT NULL,
	"source_url" text,
	"original_input" text,
	"kb_document_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"access_note" text,
	"evidence_snippet" text,
	"confidence" text DEFAULT 'medium' NOT NULL,
	"metadata" json,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "network_member_signals" ADD CONSTRAINT "network_member_signals_user_id_network_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."network_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_signal_claims" ADD CONSTRAINT "network_signal_claims_member_signal_id_network_member_signals_id_fk" FOREIGN KEY ("member_signal_id") REFERENCES "public"."network_member_signals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_signal_claims" ADD CONSTRAINT "network_signal_claims_user_id_network_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."network_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_signal_claims" ADD CONSTRAINT "network_signal_claims_source_id_network_signal_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."network_signal_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_signal_claims" ADD CONSTRAINT "network_signal_claims_kb_fact_id_network_user_kb_facts_id_fk" FOREIGN KEY ("kb_fact_id") REFERENCES "public"."network_user_kb_facts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_signal_review_events" ADD CONSTRAINT "network_signal_review_events_member_signal_id_network_member_signals_id_fk" FOREIGN KEY ("member_signal_id") REFERENCES "public"."network_member_signals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_signal_review_events" ADD CONSTRAINT "network_signal_review_events_claim_id_network_signal_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."network_signal_claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_signal_review_events" ADD CONSTRAINT "network_signal_review_events_user_id_network_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."network_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_signal_sources" ADD CONSTRAINT "network_signal_sources_member_signal_id_network_member_signals_id_fk" FOREIGN KEY ("member_signal_id") REFERENCES "public"."network_member_signals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_signal_sources" ADD CONSTRAINT "network_signal_sources_user_id_network_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."network_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_signal_sources" ADD CONSTRAINT "network_signal_sources_kb_document_id_network_user_kb_documents_id_fk" FOREIGN KEY ("kb_document_id") REFERENCES "public"."network_user_kb_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "network_member_signals_user_status" ON "network_member_signals" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "network_member_signals_updated_at" ON "network_member_signals" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "network_signal_claims_signal_id" ON "network_signal_claims" USING btree ("member_signal_id");--> statement-breakpoint
CREATE INDEX "network_signal_claims_user_visibility" ON "network_signal_claims" USING btree ("user_id","visibility");--> statement-breakpoint
CREATE INDEX "network_signal_claims_approval_state" ON "network_signal_claims" USING btree ("approval_state");--> statement-breakpoint
CREATE INDEX "network_signal_claims_source_id" ON "network_signal_claims" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "network_signal_claims_kb_fact_id" ON "network_signal_claims" USING btree ("kb_fact_id");--> statement-breakpoint
CREATE INDEX "network_signal_review_events_signal_id" ON "network_signal_review_events" USING btree ("member_signal_id");--> statement-breakpoint
CREATE INDEX "network_signal_review_events_claim_id" ON "network_signal_review_events" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "network_signal_review_events_user_id" ON "network_signal_review_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "network_signal_review_events_type" ON "network_signal_review_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "network_signal_sources_signal_id" ON "network_signal_sources" USING btree ("member_signal_id");--> statement-breakpoint
CREATE INDEX "network_signal_sources_user_id" ON "network_signal_sources" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "network_signal_sources_type_status" ON "network_signal_sources" USING btree ("source_type","status");--> statement-breakpoint
CREATE INDEX "network_signal_sources_kb_document_id" ON "network_signal_sources" USING btree ("kb_document_id");
