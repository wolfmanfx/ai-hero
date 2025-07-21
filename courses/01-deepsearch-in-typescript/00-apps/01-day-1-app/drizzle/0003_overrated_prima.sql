DROP TABLE "ai-app-template_annotation";--> statement-breakpoint
ALTER TABLE "ai-app-template_message" ADD COLUMN "annotations" json DEFAULT '[]'::json;