-- Drop existing tables if they exist
DROP TABLE IF EXISTS "ai-app-template_message";
DROP TABLE IF EXISTS "ai-app-template_chat";

-- Recreate chat table with correct structure
CREATE TABLE IF NOT EXISTS "ai-app-template_chat" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Recreate message table with correct structure
CREATE TABLE IF NOT EXISTS "ai-app-template_message" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"chat_id" varchar(255) NOT NULL,
	"role" varchar(50) NOT NULL,
	"parts" json NOT NULL,
	"order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Add foreign key constraints
DO $$ BEGIN
 ALTER TABLE "ai-app-template_chat" ADD CONSTRAINT "ai-app-template_chat_user_id_ai-app-template_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."ai-app-template_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "ai-app-template_message" ADD CONSTRAINT "ai-app-template_message_chat_id_ai-app-template_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."ai-app-template_chat"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS "chat_user_id_idx" ON "ai-app-template_chat" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "chat_created_at_idx" ON "ai-app-template_chat" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "message_chat_id_idx" ON "ai-app-template_message" USING btree ("chat_id");
CREATE INDEX IF NOT EXISTS "message_order_idx" ON "ai-app-template_message" USING btree ("chat_id","order");

-- Fix request table structure
ALTER TABLE "ai-app-template_request" DROP COLUMN IF EXISTS "prompt_tokens";
ALTER TABLE "ai-app-template_request" DROP COLUMN IF EXISTS "completion_tokens";
ALTER TABLE "ai-app-template_request" ALTER COLUMN "id" TYPE integer USING id::integer;

-- Add auto-increment to request id
CREATE SEQUENCE IF NOT EXISTS "ai-app-template_request_id_seq";
ALTER TABLE "ai-app-template_request" ALTER COLUMN "id" SET DEFAULT nextval('"ai-app-template_request_id_seq"');
ALTER SEQUENCE "ai-app-template_request_id_seq" OWNED BY "ai-app-template_request"."id";

-- Update the sequence to start from the max existing id + 1
SELECT setval('"ai-app-template_request_id_seq"', COALESCE((SELECT MAX(id) FROM "ai-app-template_request"), 0) + 1);

-- Create new index and drop old one
DROP INDEX IF EXISTS "request_user_time_idx";
CREATE INDEX IF NOT EXISTS "request_created_at_idx" ON "ai-app-template_request" USING btree ("created_at");