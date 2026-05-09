-- Create incident_votes table
CREATE TABLE "app"."incident_votes" (
    "id_incident" uuid NOT NULL REFERENCES "app"."incidents"("id") ON DELETE CASCADE,
    "id_user" uuid NOT NULL REFERENCES "app"."users"("id") ON DELETE CASCADE,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "approved" boolean NOT NULL,
    PRIMARY KEY ("id_incident", "id_user")
);
