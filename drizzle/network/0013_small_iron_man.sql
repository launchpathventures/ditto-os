CREATE TABLE "network_claim_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"discovery_profile_id" text NOT NULL,
	"candidate_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"redeemed_user_id" text,
	"redeemed_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"step_run_id" text NOT NULL,
	"metadata" json,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "network_claim_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "network_discovered_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"headline" text NOT NULL,
	"canonical_url" text,
	"contact_email" text,
	"contact_url" text,
	"contact_path_kind" text,
	"source_class" text NOT NULL,
	"source_summary" text NOT NULL,
	"request_id" text,
	"possible_connection_id" text,
	"watch_id" text,
	"status" text DEFAULT 'internal' NOT NULL,
	"claimed_user_id" text,
	"claimed_at" timestamp,
	"deleted_at" timestamp,
	"expires_at" timestamp,
	"step_run_id" text NOT NULL,
	"metadata" json,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "network_discovery_claims" (
	"id" text PRIMARY KEY NOT NULL,
	"discovery_profile_id" text NOT NULL,
	"source_id" text NOT NULL,
	"claim_text" text NOT NULL,
	"evidence_snippet" text NOT NULL,
	"confidence" text DEFAULT 'medium' NOT NULL,
	"source_class" text NOT NULL,
	"source_label" text NOT NULL,
	"source_url" text,
	"retrieval_at" timestamp NOT NULL,
	"metadata" json,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "network_discovery_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"source_class" text NOT NULL,
	"source_label" text NOT NULL,
	"source_url" text,
	"collection_method" text NOT NULL,
	"storage_policy" text NOT NULL,
	"rate_limit_policy" text NOT NULL,
	"invite_policy" text NOT NULL,
	"allowed_use" json NOT NULL,
	"policy_snapshot" jsonb NOT NULL,
	"retrieval_at" timestamp NOT NULL,
	"created_at" timestamp NOT NULL,
	"metadata" json
);
--> statement-breakpoint
CREATE TABLE "network_invitation_candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"discovery_profile_id" text NOT NULL,
	"possible_connection_id" text,
	"request_id" text,
	"watch_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"source_class" text NOT NULL,
	"contact_email" text,
	"contact_url" text,
	"contact_path_kind" text,
	"superconnector_fit" integer DEFAULT 0 NOT NULL,
	"active_opportunity_fit" integer DEFAULT 0 NOT NULL,
	"active_request_fit" integer DEFAULT 0 NOT NULL,
	"source_confidence" integer DEFAULT 0 NOT NULL,
	"invite_risk" integer DEFAULT 0 NOT NULL,
	"network_health" integer DEFAULT 0 NOT NULL,
	"total_score" integer DEFAULT 0 NOT NULL,
	"scores" json NOT NULL,
	"risk_flags" json NOT NULL,
	"suppression_reasons" json NOT NULL,
	"invite_reason" text NOT NULL,
	"proposed_subject" text,
	"proposed_body" text,
	"operator_approved_at" timestamp,
	"operator_approved_by" text,
	"sent_at" timestamp,
	"claim_token_id" text,
	"step_run_id" text NOT NULL,
	"metadata" json,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "network_invitation_events" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text,
	"discovery_profile_id" text,
	"event_type" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"channel" text,
	"reason_code" text,
	"metadata" jsonb,
	"step_run_id" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "network_claim_tokens" ADD CONSTRAINT "network_claim_tokens_discovery_profile_id_network_discovered_profiles_id_fk" FOREIGN KEY ("discovery_profile_id") REFERENCES "public"."network_discovered_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_claim_tokens" ADD CONSTRAINT "network_claim_tokens_candidate_id_network_invitation_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."network_invitation_candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_claim_tokens" ADD CONSTRAINT "network_claim_tokens_redeemed_user_id_network_users_id_fk" FOREIGN KEY ("redeemed_user_id") REFERENCES "public"."network_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_discovered_profiles" ADD CONSTRAINT "network_discovered_profiles_request_id_network_job_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."network_job_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_discovered_profiles" ADD CONSTRAINT "network_discovered_profiles_possible_connection_id_network_possible_connections_id_fk" FOREIGN KEY ("possible_connection_id") REFERENCES "public"."network_possible_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_discovered_profiles" ADD CONSTRAINT "network_discovered_profiles_claimed_user_id_network_users_id_fk" FOREIGN KEY ("claimed_user_id") REFERENCES "public"."network_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_discovery_claims" ADD CONSTRAINT "network_discovery_claims_discovery_profile_id_network_discovered_profiles_id_fk" FOREIGN KEY ("discovery_profile_id") REFERENCES "public"."network_discovered_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_discovery_claims" ADD CONSTRAINT "network_discovery_claims_source_id_network_discovery_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."network_discovery_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_invitation_candidates" ADD CONSTRAINT "network_invitation_candidates_discovery_profile_id_network_discovered_profiles_id_fk" FOREIGN KEY ("discovery_profile_id") REFERENCES "public"."network_discovered_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_invitation_candidates" ADD CONSTRAINT "network_invitation_candidates_possible_connection_id_network_possible_connections_id_fk" FOREIGN KEY ("possible_connection_id") REFERENCES "public"."network_possible_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_invitation_candidates" ADD CONSTRAINT "network_invitation_candidates_request_id_network_job_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."network_job_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_invitation_events" ADD CONSTRAINT "network_invitation_events_candidate_id_network_invitation_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."network_invitation_candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_invitation_events" ADD CONSTRAINT "network_invitation_events_discovery_profile_id_network_discovered_profiles_id_fk" FOREIGN KEY ("discovery_profile_id") REFERENCES "public"."network_discovered_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "network_claim_tokens_hash" ON "network_claim_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "network_claim_tokens_profile_id" ON "network_claim_tokens" USING btree ("discovery_profile_id");--> statement-breakpoint
CREATE INDEX "network_claim_tokens_candidate_id" ON "network_claim_tokens" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "network_claim_tokens_expires_at" ON "network_claim_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "network_discovered_profiles_status_created_at" ON "network_discovered_profiles" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "network_discovered_profiles_request_id" ON "network_discovered_profiles" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "network_discovered_profiles_possible_connection_id" ON "network_discovered_profiles" USING btree ("possible_connection_id");--> statement-breakpoint
CREATE INDEX "network_discovered_profiles_contact_email" ON "network_discovered_profiles" USING btree ("contact_email");--> statement-breakpoint
CREATE INDEX "network_discovery_claims_profile_id" ON "network_discovery_claims" USING btree ("discovery_profile_id");--> statement-breakpoint
CREATE INDEX "network_discovery_claims_source_id" ON "network_discovery_claims" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "network_discovery_claims_source_class" ON "network_discovery_claims" USING btree ("source_class");--> statement-breakpoint
CREATE INDEX "network_discovery_sources_class_created_at" ON "network_discovery_sources" USING btree ("source_class","created_at");--> statement-breakpoint
CREATE INDEX "network_discovery_sources_url" ON "network_discovery_sources" USING btree ("source_url");--> statement-breakpoint
CREATE INDEX "network_invitation_candidates_status_created_at" ON "network_invitation_candidates" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "network_invitation_candidates_profile_id" ON "network_invitation_candidates" USING btree ("discovery_profile_id");--> statement-breakpoint
CREATE INDEX "network_invitation_candidates_request_id" ON "network_invitation_candidates" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "network_invitation_candidates_watch_id" ON "network_invitation_candidates" USING btree ("watch_id");--> statement-breakpoint
CREATE INDEX "network_invitation_events_candidate_id" ON "network_invitation_events" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "network_invitation_events_profile_id" ON "network_invitation_events" USING btree ("discovery_profile_id");--> statement-breakpoint
CREATE INDEX "network_invitation_events_type_created_at" ON "network_invitation_events" USING btree ("event_type","created_at");