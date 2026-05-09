-- Create incident_type table
CREATE TABLE "app"."incident_type" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "label" text NOT NULL
);
