ALTER TABLE "introductions" ADD COLUMN "requester_approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "introductions" ADD COLUMN "recipient_approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "introductions" ADD COLUMN "thread_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "introductions" ADD COLUMN "recipient_user_id" text;--> statement-breakpoint
ALTER TABLE "introductions" ADD COLUMN "recipient_email" text;--> statement-breakpoint
ALTER TABLE "introductions" ADD COLUMN "thread_message_id" text;--> statement-breakpoint
ALTER TABLE "introductions" ADD COLUMN "decline_category" text;--> statement-breakpoint
ALTER TABLE "introductions" ADD COLUMN "follow_up_cadence_days" integer DEFAULT 14 NOT NULL;--> statement-breakpoint
ALTER TABLE "introductions" ADD COLUMN "recipient_delivery_id" text;--> statement-breakpoint
ALTER TABLE "introductions" ADD COLUMN "requester_delivery_id" text;--> statement-breakpoint
ALTER TABLE "introductions" ADD CONSTRAINT "introductions_recipient_user_id_network_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."network_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "introductions" ADD CONSTRAINT "introductions_recipient_delivery_id_network_workspace_deliveries_id_fk" FOREIGN KEY ("recipient_delivery_id") REFERENCES "public"."network_workspace_deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "introductions" ADD CONSTRAINT "introductions_requester_delivery_id_network_workspace_deliveries_id_fk" FOREIGN KEY ("requester_delivery_id") REFERENCES "public"."network_workspace_deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "introductions_recipient_user_id" ON "introductions" USING btree ("recipient_user_id");--> statement-breakpoint
CREATE INDEX "introductions_thread_message_id" ON "introductions" USING btree ("thread_message_id");