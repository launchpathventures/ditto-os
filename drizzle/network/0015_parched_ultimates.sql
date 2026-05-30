CREATE TABLE "network_intro_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"intro_id" text NOT NULL,
	"party" text NOT NULL,
	"event_type" text NOT NULL,
	"classified_category" text NOT NULL,
	"free_text" text,
	"outcome_class" text,
	"outcome_amount_cents" integer,
	"source_step_run_id" text NOT NULL,
	"source_message_id" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "network_outcome_metrics" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"useful_count" integer DEFAULT 0 NOT NULL,
	"not_useful_count" integer DEFAULT 0 NOT NULL,
	"no_outcome_yet_count" integer DEFAULT 0 NOT NULL,
	"advisory_count" integer DEFAULT 0 NOT NULL,
	"hire_count" integer DEFAULT 0 NOT NULL,
	"client_count" integer DEFAULT 0 NOT NULL,
	"funding_count" integer DEFAULT 0 NOT NULL,
	"partnership_count" integer DEFAULT 0 NOT NULL,
	"collaboration_count" integer DEFAULT 0 NOT NULL,
	"no_outcome_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "introductions" ADD COLUMN "feedback_requested_at" timestamp;--> statement-breakpoint
ALTER TABLE "introductions" ADD COLUMN "feedback_collected_at" timestamp;--> statement-breakpoint
ALTER TABLE "introductions" ADD COLUMN "last_classified_reply_at" timestamp;--> statement-breakpoint
ALTER TABLE "network_intro_feedback" ADD CONSTRAINT "network_intro_feedback_intro_id_introductions_id_fk" FOREIGN KEY ("intro_id") REFERENCES "public"."introductions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "network_intro_feedback_intro_id" ON "network_intro_feedback" USING btree ("intro_id");--> statement-breakpoint
CREATE INDEX "network_intro_feedback_party" ON "network_intro_feedback" USING btree ("party");--> statement-breakpoint
CREATE INDEX "network_intro_feedback_category" ON "network_intro_feedback" USING btree ("classified_category");--> statement-breakpoint
CREATE INDEX "network_intro_feedback_created_at" ON "network_intro_feedback" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "network_outcome_metrics_workspace_period_unique" ON "network_outcome_metrics" USING btree ("workspace_id","period_start");--> statement-breakpoint
CREATE INDEX "network_outcome_metrics_workspace_id" ON "network_outcome_metrics" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "introductions_feedback_requested_at" ON "introductions" USING btree ("feedback_requested_at");--> statement-breakpoint
CREATE INDEX "introductions_feedback_collected_at" ON "introductions" USING btree ("feedback_collected_at");
