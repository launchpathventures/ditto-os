CREATE TABLE "network_job_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"job_request_card" json NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "network_job_requests" ADD CONSTRAINT "network_job_requests_user_id_network_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."network_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "network_job_requests_user_id" ON "network_job_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "network_job_requests_status" ON "network_job_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "network_job_requests_updated_at" ON "network_job_requests" USING btree ("updated_at");