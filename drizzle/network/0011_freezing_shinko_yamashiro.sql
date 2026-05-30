CREATE TABLE "network_tombstones" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id_hash" text NOT NULL,
	"deleted_reason" text,
	"deleted_by_actor_type" text NOT NULL,
	"deleted_at" timestamp NOT NULL,
	"purge_after" timestamp NOT NULL,
	"permanent_stub_at" timestamp NOT NULL,
	"purged_at" timestamp,
	"stubbed_at" timestamp,
	"step_run_id" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "network_tombstones_subject_unique" ON "network_tombstones" USING btree ("subject_type","subject_id_hash");--> statement-breakpoint
CREATE INDEX "network_tombstones_purge_after" ON "network_tombstones" USING btree ("purge_after");--> statement-breakpoint
CREATE INDEX "network_tombstones_permanent_stub_at" ON "network_tombstones" USING btree ("permanent_stub_at");