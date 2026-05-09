-- Create incident_reports table
CREATE TABLE "app"."incident_reports" (
    "id_incident" uuid NOT NULL REFERENCES "app"."incidents"("id") ON DELETE CASCADE,
    "id_user" uuid NOT NULL REFERENCES "app"."users"("id") ON DELETE CASCADE,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "title" varchar NOT NULL,
    "description" varchar NOT NULL,
    PRIMARY KEY ("id_incident", "id_user")
);
