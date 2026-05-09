-- Fix jsonb_to_integer_array to handle scalars gracefully
CREATE OR REPLACE FUNCTION app.jsonb_to_integer_array(json_val jsonb)
 RETURNS integer[]
 LANGUAGE sql
 IMMUTABLE STRICT
AS $function$
    SELECT ARRAY(
        SELECT jsonb_array_elements_text(
            CASE 
                WHEN jsonb_typeof(json_val) = 'array' THEN json_val 
                ELSE '[]'::jsonb 
            END
        )::int
    );
$function$;

-- Fix text_array_to_timemultirange to take text[] instead of jsonb
CREATE OR REPLACE FUNCTION app.text_array_to_timemultirange(text_val text[])
 RETURNS app.timemultirange
 LANGUAGE sql
 IMMUTABLE STRICT
AS $function$
    WITH parsed AS (
        SELECT 
            left(rng, 1) AS b_lower,
            right(rng, 1) AS b_upper,
            nullif(trim(split_part(substring(rng, 2, length(rng)-2), ',', 1)), '')::time AS t_start,
            nullif(trim(split_part(substring(rng, 2, length(rng)-2), ',', 2)), '')::time AS t_end
        FROM unnest(text_val) AS rng
    ),
    split_ranges AS (
        SELECT app.timerange(t_start, t_end, b_lower || b_upper) AS tr
        FROM parsed
        WHERE t_start <= t_end
        
        UNION ALL
        
        SELECT app.timerange(t_start, '24:00:00'::time, b_lower || ')') AS tr
        FROM parsed
        WHERE t_start > t_end
        
        UNION ALL
        
        SELECT app.timerange('00:00:00'::time, t_end, '[' || b_upper) AS tr
        FROM parsed
        WHERE t_start > t_end
    )
    SELECT range_agg(tr) FROM split_ranges;
$function$;
