-- Supabase Realtime private Broadcast authorization for NjangiTrust.
-- Apply using the Supabase project owner/direct connection. The custom client JWT
-- minted by /v1/auth/realtime-token uses sub=user id, role=authenticated, sid=session id.
-- In the Supabase dashboard disable "Allow public access" for Realtime channels.

DO $do$
BEGIN
  -- Local PostgreSQL development databases do not include Supabase's auth/realtime schemas.
  IF to_regclass('realtime.messages') IS NULL OR to_regprocedure('auth.uid()') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $sql$
CREATE OR REPLACE FUNCTION public.njangi_can_receive_group_realtime(topic text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."Membership" AS membership
    WHERE membership."userId" = auth.uid()
      AND membership."status" IN ('INVITED', 'ACTIVE', 'LEAVING')
      AND membership."groupId" = CASE
        WHEN topic ~ '^group:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN substring(topic FROM 7)::uuid
        ELSE NULL
      END
  );
$$;
$sql$;

  EXECUTE 'REVOKE ALL ON FUNCTION public.njangi_can_receive_group_realtime(text) FROM PUBLIC';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.njangi_can_receive_group_realtime(text) TO authenticated';

  EXECUTE 'DROP POLICY IF EXISTS "njangi realtime receive" ON "realtime"."messages"';

  EXECUTE $sql$
CREATE POLICY "njangi realtime receive"
ON "realtime"."messages"
FOR SELECT
TO authenticated
USING (
  "extension" = 'broadcast'
  AND (
    realtime.topic() = ('user:' || auth.uid()::text)
    OR realtime.topic() = ('session:' || COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'sid', ''))
    OR public.njangi_can_receive_group_realtime(realtime.topic())
  )
);
$sql$;
END $do$;
