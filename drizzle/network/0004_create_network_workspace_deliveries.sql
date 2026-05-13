CREATE TABLE "network_workspace_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"blocks" json NOT NULL,
	"dedupe_key" text,
	"source_step_run_id" text,
	"imported_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "network_workspace_deliveries" ADD CONSTRAINT "network_workspace_deliveries_user_id_network_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."network_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "network_workspace_deliveries_user_status" ON "network_workspace_deliveries" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "network_workspace_deliveries_dedupe_key" ON "network_workspace_deliveries" USING btree ("dedupe_key");