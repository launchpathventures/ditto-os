CREATE TABLE "introductions" (
	"id" text PRIMARY KEY NOT NULL,
	"target_user_id" text NOT NULL,
	"requester_user_id" text,
	"visitor_session_id" text,
	"requester_display_name" text,
	"requester_org_label" text,
	"origin_context" text NOT NULL,
	"intent_summary" text NOT NULL,
	"draft" text,
	"cost_label" text,
	"authorization_id" text,
	"authorization_block" json,
	"transcript" json,
	"state" text NOT NULL,
	"refusal_reason" text,
	"source_step_run_id" text,
	"metadata" json,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "network_session_upsell_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"trigger" text NOT NULL,
	"fired_at" timestamp NOT NULL,
	CONSTRAINT "network_session_upsell_log_user_trigger_unique" UNIQUE("user_id","trigger")
);
--> statement-breakpoint
CREATE TABLE "network_user_block_list" (
	"id" text PRIMARY KEY NOT NULL,
	"target_user_id" text NOT NULL,
	"kind" text NOT NULL,
	"blocked_requester_identifier" text NOT NULL,
	"reason" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "network_user_block_list_target_identifier_unique" UNIQUE("target_user_id","kind","blocked_requester_identifier")
);
--> statement-breakpoint
ALTER TABLE "introductions" ADD CONSTRAINT "introductions_target_user_id_network_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."network_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "introductions" ADD CONSTRAINT "introductions_requester_user_id_network_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."network_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_session_upsell_log" ADD CONSTRAINT "network_session_upsell_log_user_id_network_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."network_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_user_block_list" ADD CONSTRAINT "network_user_block_list_target_user_id_network_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."network_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "introductions_target_user_id" ON "introductions" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "introductions_requester_user_id" ON "introductions" USING btree ("requester_user_id");--> statement-breakpoint
CREATE INDEX "introductions_visitor_session_id" ON "introductions" USING btree ("visitor_session_id");--> statement-breakpoint
CREATE INDEX "introductions_state" ON "introductions" USING btree ("state");--> statement-breakpoint
CREATE INDEX "introductions_authorization_id" ON "introductions" USING btree ("authorization_id");--> statement-breakpoint
CREATE INDEX "network_session_upsell_log_user_id" ON "network_session_upsell_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "network_user_block_list_target_user_id" ON "network_user_block_list" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "network_user_block_list_identifier" ON "network_user_block_list" USING btree ("blocked_requester_identifier");