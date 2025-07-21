CREATE TABLE IF NOT EXISTS "ai-app-template_annotation" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"message_id" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"action" json NOT NULL,
	"order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai-app-template_annotation" ADD CONSTRAINT "ai-app-template_annotation_message_id_ai-app-template_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."ai-app-template_message"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "annotation_message_id_idx" ON "ai-app-template_annotation" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "annotation_order_idx" ON "ai-app-template_annotation" USING btree ("message_id","order");