-- Chiusura additiva dei P1 billing dopo il rolling deploy mode-aware.
-- Non modifica la cronologia: sostituisce soltanto l'RPC di attach e revoca
-- la firma legacy del claim, se ancora presente.

CREATE OR REPLACE FUNCTION public.ueradar_attach_checkout_session(
  _user_id uuid, _price_id text, _session_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _row record;
BEGIN
  IF _user_id IS NULL OR coalesce(_price_id, '') = '' OR coalesce(_session_id, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('ueradar_checkout:' || _user_id::text, 0));

  SELECT * INTO _row FROM public.ueradar_checkout_intents
  WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CHECKOUT_INTENT_MISSING');
  END IF;
  IF _row.price_id IS DISTINCT FROM _price_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CHECKOUT_INTENT_PRICE_MISMATCH');
  END IF;
  IF _row.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CHECKOUT_INTENT_EXPIRED');
  END IF;
  IF _row.session_id IS NOT NULL AND _row.session_id IS DISTINCT FROM _session_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CHECKOUT_SESSION_ALREADY_BOUND');
  END IF;

  UPDATE public.ueradar_checkout_intents
  SET session_id = _session_id
  WHERE user_id = _user_id;

  RETURN jsonb_build_object('ok', true, 'code', 'OK');
END;
$$;

REVOKE ALL ON FUNCTION public.ueradar_attach_checkout_session(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ueradar_attach_checkout_session(uuid, text, text)
  TO service_role;

-- La firma a sette argomenti e' l'unico contratto runtime ammesso. Il blocco
-- resta idempotente anche se un ambiente nuovo non contiene piu' la legacy.
DO $$
BEGIN
  IF to_regprocedure(
    'public.ueradar_billing_claim_event(text,text,text,text,timestamptz,integer)'
  ) IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.ueradar_billing_claim_event(text, text, text, text, timestamptz, integer) FROM PUBLIC, anon, authenticated, service_role';
  END IF;
END;
$$;
