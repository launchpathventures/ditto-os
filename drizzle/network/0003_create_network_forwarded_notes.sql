CREATE TABLE "network_forwarded_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"from_visitor_name" text,
	"from_visitor_org" text,
	"fact_question_md" text NOT NULL,
	"visitor_ip" text,
	"visitor_session_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "network_forwarded_notes" ADD CONSTRAINT "network_forwarded_notes_user_id_network_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."network_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "network_forwarded_notes_user_id" ON "network_forwarded_notes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "network_forwarded_notes_status" ON "network_forwarded_notes" USING btree ("status");