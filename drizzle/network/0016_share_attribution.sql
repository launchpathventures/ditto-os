CREATE TABLE "network_share_attribution" (
	"id" text PRIMARY KEY NOT NULL,
	"profile_handle" text NOT NULL,
	"channel" text NOT NULL,
	"action" text NOT NULL,
	"visitor_sid_hash" text,
	"ts" timestamp NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "network_share_attribution_profile_channel_ts" ON "network_share_attribution" USING btree ("profile_handle","channel","ts");
