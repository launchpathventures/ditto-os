CREATE TABLE "network_suppressions" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier_hash" text NOT NULL,
	"identifier_kind" text NOT NULL,
	"scope" text NOT NULL,
	"scope_user_id" text,
	"reason" text NOT NULL,
	"source" text NOT NULL,
	"expires_at" timestamp,
	"step_run_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "network_suppressions_scope_user_id_check" CHECK (("scope" = 'global' AND "scope_user_id" IS NULL) OR ("scope" = 'per-user' AND "scope_user_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "network_webhook_deliveries" (
	"svix_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"step_run_id" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "network_suppressions_identifier" ON "network_suppressions" USING btree ("identifier_hash");--> statement-breakpoint
CREATE INDEX "network_suppressions_reason_created_at" ON "network_suppressions" USING btree ("reason","created_at");--> statement-breakpoint
CREATE INDEX "network_suppressions_source_created_at" ON "network_suppressions" USING btree ("source","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "network_suppressions_global_identifier_unique" ON "network_suppressions" USING btree ("identifier_hash","scope") WHERE "scope" = 'global';--> statement-breakpoint
CREATE UNIQUE INDEX "network_suppressions_per_user_identifier_unique" ON "network_suppressions" USING btree ("identifier_hash","scope","scope_user_id") WHERE "scope" = 'per-user';--> statement-breakpoint
CREATE INDEX "network_webhook_deliveries_expires_at" ON "network_webhook_deliveries" USING btree ("expires_at");
