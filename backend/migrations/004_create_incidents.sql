-- Create incidents table
DROP TABLE If EXISTS app.incidents;
CREATE TABLE "app"."incidents" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "type" uuid NOT NULL REFERENCES "app"."incident_type"("id") ON DELETE CASCADE,
    "location" geography(Polygon, 4326) NOT NULL,
    "confidence_score" smallint NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 100) DEFAULT 0,
    "confirmed" boolean NOT NULL DEFAULT false
);
