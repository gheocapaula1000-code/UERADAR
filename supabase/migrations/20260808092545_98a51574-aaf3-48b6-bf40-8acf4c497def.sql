CREATE OR REPLACE FUNCTION public.ueradar_accept_invite(
  _member_id uuid,
  _user_id uuid,
  _email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _norm text := lower(btrim(coalesce(_email, '')));
  _sub record;
  _row record;
  _neutralized boolean := false;
BEGIN
  IF _user_id IS NULL OR _member_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  END IF;
  IF _norm = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'EMAIL_NOT_VERIFIABLE');
  END IF;

  IF EXISTS (SELECT 1 FROM public.ueradar_company_members WHERE member_user_id = _user_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_MEMBER_OF_ANOTHER_COMPANY');
  END IF;

  -- Abbonamento personale presso il provider: mai lasciato attivo senza portale.
  SELECT * INTO _sub FROM public.ueradar_subscriptions
  WHERE user_id = _user_id FOR UPDATE;

  IF FOUND AND (
    _sub.provider_subscription_id IS NOT NULL
    OR (_sub.provider IS NOT NULL AND _sub.status IN ('active', 'trialing', 'past_due', 'unpaid'))
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PERSONAL_SUBSCRIPTION_MUST_BE_MANAGED');
  END IF;

  UPDATE public.ueradar_company_members
  SET member_user_id = _user_id,
      status = 'accepted',
      accepted_at = now()
  WHERE id = _member_id
    AND status = 'invited'
    AND member_user_id IS NULL
    AND lower(email) = _norm
    AND owner_user_id <> _user_id
  RETURNING * INTO _row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVITE_NOT_AVAILABLE');
  END IF;

  -- Trial locale non-provider: neutralizzato nella stessa transazione.
  IF _sub.user_id IS NOT NULL
     AND _sub.provider_subscription_id IS NULL
     AND _sub.status = 'trialing' THEN
    UPDATE public.ueradar_subscriptions
    SET status = 'superseded_by_tenant',
        trial_consumed = true,
        trial_ends_at = now()
    WHERE user_id = _user_id
      AND provider_subscription_id IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TRIAL_NEUTRALIZATION_FAILED';
    END IF;
    _neutralized := true;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'owner_user_id', _row.owner_user_id,
    'trial_neutralized', _neutralized
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_MEMBER');
END;
$$;

REVOKE ALL ON FUNCTION public.ueradar_accept_invite(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ueradar_accept_invite(uuid, uuid, text) TO service_role;
