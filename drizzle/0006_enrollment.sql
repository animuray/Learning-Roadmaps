CREATE TABLE "enrollment" (
	"user_id" text NOT NULL,
	"roadmap" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"enrolled_at" timestamp DEFAULT now() NOT NULL,
	"last_opened_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "enrollment_user_id_roadmap_pk" PRIMARY KEY("user_id","roadmap")
);
--> statement-breakpoint
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Кто уже начал проходить роадмап, считается записанным на него.
INSERT INTO "enrollment" ("user_id", "roadmap", "status", "enrolled_at", "last_opened_at")
SELECT "user_id", "roadmap", 'active', min("started_at"), max("updated_at") FROM "topic_progress" GROUP BY "user_id", "roadmap"
ON CONFLICT DO NOTHING;
