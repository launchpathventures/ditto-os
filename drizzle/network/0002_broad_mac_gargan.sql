CREATE TABLE "network_user_anti_persona" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"rule_md" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"storage_path" text NOT NULL,
	"metadata" json,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "network_user_kb_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"source_label" text NOT NULL,
	"mime_type" text,
	"original_filename" text,
	"sanitized_filename" text NOT NULL,
	"storage_path" text NOT NULL,
	"sha256" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"visibility_default" text DEFAULT 'on-request' NOT NULL,
	"metadata" json,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "network_user_kb_facts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"document_id" text,
	"source_label" text NOT NULL,
	"source_locator" text,
	"fact_md" text NOT NULL,
	"visibility" text DEFAULT 'on-request' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"storage_path" text NOT NULL,
	"metadata" json,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "network_user_voice_intake" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"document_id" text,
	"transcript_storage_path" text NOT NULL,
	"status" text DEFAULT 'reviewed' NOT NULL,
	"error" text,
	"metadata" json,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "network_user_anti_persona" ADD CONSTRAINT "network_user_anti_persona_user_id_network_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."network_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_user_kb_documents" ADD CONSTRAINT "network_user_kb_documents_user_id_network_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."network_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_user_kb_facts" ADD CONSTRAINT "network_user_kb_facts_user_id_network_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."network_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_user_kb_facts" ADD CONSTRAINT "network_user_kb_facts_document_id_network_user_kb_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."network_user_kb_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_user_voice_intake" ADD CONSTRAINT "network_user_voice_intake_user_id_network_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."network_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_user_voice_intake" ADD CONSTRAINT "network_user_voice_intake_document_id_network_user_kb_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."network_user_kb_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "network_user_anti_persona_user_id" ON "network_user_anti_persona" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "network_user_anti_persona_status" ON "network_user_anti_persona" USING btree ("status");--> statement-breakpoint
CREATE INDEX "network_user_anti_persona_updated_at" ON "network_user_anti_persona" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "network_user_kb_documents_user_id" ON "network_user_kb_documents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "network_user_kb_documents_status" ON "network_user_kb_documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "network_user_kb_documents_updated_at" ON "network_user_kb_documents" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "network_user_kb_facts_user_id" ON "network_user_kb_facts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "network_user_kb_facts_user_visibility" ON "network_user_kb_facts" USING btree ("user_id","visibility");--> statement-breakpoint
CREATE INDEX "network_user_kb_facts_status" ON "network_user_kb_facts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "network_user_kb_facts_updated_at" ON "network_user_kb_facts" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "network_user_voice_intake_user_id" ON "network_user_voice_intake" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "network_user_voice_intake_status" ON "network_user_voice_intake" USING btree ("status");--> statement-breakpoint
CREATE INDEX "network_user_voice_intake_updated_at" ON "network_user_voice_intake" USING btree ("updated_at");