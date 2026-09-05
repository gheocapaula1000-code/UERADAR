-- Invito pubblico: token opaco, unicità solo sui posti vivi, reinvito dopo revoca.

ALTER TABLE public.ueradar_company_members
  ADD COLUMN IF NOT EXISTS invite_token uuid;

UPDATE public.ueradar_company_members
SET invite_token = gen_random_uuid()
WHERE invite_token IS NULL AND status = 'invited';

CREATE UNIQUE INDEX IF NOT EXISTS ueradar_company_members_invite_token_idx
  ON public.ueradar_company_members (invite_token)
  WHERE invite_token IS NOT NULL;

DROP INDEX IF EXISTS ueradar_company_members_owner_email_idx;
CREATE UNIQUE INDEX ueradar_company_members_owner_email_idx
  ON public.ueradar_company_members (owner_user_id, lower(email))
  WHERE status IN ('invited', 'accepted');

CREATE OR REPLACE FUNCTION public.ueradar_invite_member(
  _owner uuid,
  _email text,
  _first_name text,
  _last_name text,
  _declared_role text,
  _seats integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _norm text;
  _count integer;
  _existing record;
  _id uuid;
  _token uuid;
BEGIN
  IF _owner IS NULL OR _seats IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  END IF;
  IF _declared_role NOT IN ('dipendente','socio','amministratore') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ROLE');
  END IF;
  _norm := lower(btrim(coalesce(_email, '')));
  IF _norm = '' OR position('@' in _norm) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_EMAIL');
  END IF;
  IF _seats = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ENTITLED');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('ueradar_seats:' || _owner::text, 0));

  SELECT id, status, member_user_id
    INTO _existing
  FROM public.ueradar_company_members
  WHERE owner_user_id = _owner AND lower(email) = _norm
  LIMIT 1;

  IF _existing.id IS NOT NULL AND _existing.status IN ('invited', 'accepted') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'MEMBER_ALREADY_PRESENT');
  END IF;

  -- I revocati non occupano posti: il titolare può reinvitare la stessa email.
  SELECT count(*) INTO _count
  FROM public.ueradar_company_members
  WHERE owner_user_id = _owner
    AND status IN ('invited', 'accepted');

  IF _seats > 0 AND (_count + 1 + 1) > _seats THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEATS_EXCEEDED', 'used', _count + 1);
  END IF;

  -- Reinvito: un posto revocato torna disponibile senza seconda riga.
  IF _existing.id IS NOT NULL AND _existing.status = 'revoked' THEN
    _token := gen_random_uuid();
    UPDATE public.ueradar_company_members
    SET first_name = btrim(_first_name),
        last_name = btrim(_last_name),
        declared_role = _declared_role,
        owner_attested_at = now(),
        invited_at = now(),
        accepted_at = NULL,
        member_user_id = NULL,
        role = 'member',
        status = 'invited',
        invite_token = _token
    WHERE id = _existing.id
    RETURNING id INTO _id;
    RETURN jsonb_build_object('ok', true, 'code', 'OK', 'used', _count + 2,
                              'invite_id', _id, 'invite_token', _token);
  END IF;

  _token := gen_random_uuid();
  INSERT INTO public.ueradar_company_members
    (owner_user_id, email, first_name, last_name, declared_role, owner_attested_at,
     role, status, invite_token)
  VALUES (_owner, _norm, btrim(_first_name), btrim(_last_name), _declared_role, now(),
          'member', 'invited', _token)
  RETURNING id INTO _id;

  RETURN jsonb_build_object('ok', true, 'code', 'OK', 'used', _count + 2,
                            'invite_id', _id, 'invite_token', _token);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'code', 'MEMBER_ALREADY_PRESENT');
END;
$$;

REVOKE ALL ON FUNCTION public.ueradar_invite_member(uuid, text, text, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ueradar_invite_member(uuid, text, text, text, text, integer) TO service_role;
