CREATE TABLE "review_item" (
	"user_id" text NOT NULL,
	"roadmap" text NOT NULL,
	"topic" text NOT NULL,
	"question_id" text NOT NULL,
	"box" integer DEFAULT 0 NOT NULL,
	"due_at" timestamp NOT NULL,
	"lapses" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "review_item_user_id_roadmap_topic_question_id_pk" PRIMARY KEY("user_id","roadmap","topic","question_id")
);
--> statement-breakpoint
ALTER TABLE "review_item" ADD CONSTRAINT "review_item_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_item_due_idx" ON "review_item" USING btree ("user_id","due_at");