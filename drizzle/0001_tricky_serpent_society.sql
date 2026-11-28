CREATE TABLE "sql_solve" (
	"user_id" text NOT NULL,
	"roadmap" text NOT NULL,
	"topic" text NOT NULL,
	"task_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sql_solve_user_id_roadmap_topic_task_key_pk" PRIMARY KEY("user_id","roadmap","topic","task_key")
);
--> statement-breakpoint
ALTER TABLE "sql_solve" ADD CONSTRAINT "sql_solve_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;