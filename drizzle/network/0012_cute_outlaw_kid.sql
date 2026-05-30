CREATE TABLE "network_rate_counters" (
	"id" text PRIMARY KEY NOT NULL,
	"bucket_key" text NOT NULL,
	"window_start" timestamp NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "network_rate_counters_bucket_window_unique" ON "network_rate_counters" USING btree ("bucket_key","window_start");--> statement-breakpoint
CREATE INDEX "network_rate_counters_updated_at" ON "network_rate_counters" USING btree ("updated_at");