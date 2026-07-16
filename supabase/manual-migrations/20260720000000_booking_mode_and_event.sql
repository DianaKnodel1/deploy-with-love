-- Booking-Mode + Event-Metadaten pro Landing Page.
-- 'calendly' (Default = bestehendes Verhalten), 'internal' = eigenes System.
-- Vermittlungs-Pages brauchen IMMER einen Modus (kein 'off').

DO $$ BEGIN
  CREATE TYPE public.landing_booking_mode AS ENUM ('calendly', 'internal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.landing_pages
  ADD COLUMN IF NOT EXISTS booking_mode public.landing_booking_mode NOT NULL DEFAULT 'calendly',
  ADD COLUMN IF NOT EXISTS event_description text,
  ADD COLUMN IF NOT EXISTS booking_window_days integer NOT NULL DEFAULT 30
    CHECK (booking_window_days BETWEEN 1 AND 180);


-- get_schedule_for_application: nur Landings mit booking_mode='internal' liefern einen Kalender.
CREATE OR REPLACE FUNCTION public.get_schedule_for_application(p_token text)
RETURNS TABLE (
  schedule_id uuid,
  landing_page_id uuid,
  slot_duration_minutes int,
  buffer_minutes int,
  timezone text,
  event_description text,
  booking_window_days int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH app AS (
    SELECT a.source_landing_id, a.target_landing_id,
           lp_src.linked_fasttrack_landing_id AS src_linked
      FROM public.applications a
      LEFT JOIN public.landing_pages lp_src ON lp_src.id = a.source_landing_id
     WHERE a.magic_token = p_token
       AND (a.magic_token_expires_at IS NULL OR a.magic_token_expires_at > now())
     LIMIT 1
  ),
  candidates AS (
    SELECT target_landing_id AS lp_id, 1 AS prio FROM app WHERE target_landing_id IS NOT NULL
    UNION ALL
    SELECT src_linked, 2 FROM app WHERE src_linked IS NOT NULL
    UNION ALL
    SELECT source_landing_id, 3 FROM app WHERE source_landing_id IS NOT NULL
  )
  SELECT s.id, lp.id, s.slot_duration_minutes, s.buffer_minutes, s.timezone,
         lp.event_description, lp.booking_window_days
    FROM candidates c
    JOIN public.landing_pages lp ON lp.id = c.lp_id
    JOIN public.availability_schedules s
      ON s.landing_page_id = lp.id AND s.active = true
   WHERE lp.booking_mode = 'internal'
   ORDER BY c.prio
   LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_schedule_for_application(text) TO anon, authenticated;
