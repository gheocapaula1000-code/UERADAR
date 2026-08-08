CREATE OR REPLACE FUNCTION public.ueradar_claim_search_lane(_tenant uuid, _period text, _lane text, _min_interval_minutes integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _last timestamptz; _retry integer; _now timestamptz := now();
BEGIN
  IF _tenant IS NULL OR _lane NOT IN ('full','urgent') OR _min_interval_minutes IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'INVALID_INPUT', 'retry_after_seconds', 0);
  END IF;

  INSERT INTO public.ueradar_usage_counters (user_id, period_ym)
  VALUES (_tenant, _period)
  ON CONFLICT (user_id, period_ym) DO NOTHING;

  SELECT CASE WHEN _lane = 'full' THEN last_full_search_at ELSE last_urgent_search_at END
  INTO _last
  FROM public.ueradar_usage_counters
  WHERE user_id = _tenant AND period_ym = _period
  FOR UPDATE;

  IF _last IS NOT NULL AND _now < _last + make_interval(mins => _min_interval_minutes) THEN
    _retry := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (_last + make_interval(mins => _min_interval_minutes) - _now))))::integer;
    RETURN jsonb_build_object('allowed', false, 'code', 'TOO_SOON', 'retry_after_seconds', _retry);
  END IF;

  IF _lane = 'full' THEN
    UPDATE public.ueradar_usage_counters SET last_full_search_at = _now
    WHERE user_id = _tenant AND period_ym = _period;
  ELSE
    UPDATE public.ueradar_usage_counters SET last_urgent_search_at = _now
    WHERE user_id = _tenant AND period_ym = _period;
  END IF;

  -- claimed_at/previous_at permettono di rilasciare la prenotazione se il
  -- motore non conferma la coda: l'intervallo non resta bruciato.
  RETURN jsonb_build_object('allowed', true, 'code', 'OK', 'retry_after_seconds', 0,
                            'claimed_at', to_char(_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                            'previous_at', CASE WHEN _last IS NULL THEN NULL
                              ELSE to_char(_last AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.ueradar_release_search_lane(_tenant uuid, _period text, _lane text, _claimed_at timestamptz, _previous_at timestamptz)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _current timestamptz;
BEGIN
  IF _tenant IS NULL OR _lane NOT IN ('full','urgent') OR _claimed_at IS NULL THEN
    RETURN jsonb_build_object('released', false, 'code', 'INVALID_INPUT');
  END IF;

  SELECT CASE WHEN _lane = 'full' THEN last_full_search_at ELSE last_urgent_search_at END
  INTO _current
  FROM public.ueradar_usage_counters
  WHERE user_id = _tenant AND period_ym = _period
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('released', false, 'code', 'NO_COUNTER');
  END IF;

  -- Solo il proprietario della prenotazione può rilasciarla: se un'altra
  -- richiesta è subentrata, il suo intervallo resta valido.
  IF _current IS DISTINCT FROM _claimed_at THEN
    RETURN jsonb_build_object('released', false, 'code', 'CLAIM_SUPERSEDED');
  END IF;

  IF _lane = 'full' THEN
    UPDATE public.ueradar_usage_counters SET last_full_search_at = _previous_at
    WHERE user_id = _tenant AND period_ym = _period;
  ELSE
    UPDATE public.ueradar_usage_counters SET last_urgent_search_at = _previous_at
    WHERE user_id = _tenant AND period_ym = _period;
  END IF;

  RETURN jsonb_build_object('released', true, 'code', 'OK');
END;
$function$;

REVOKE ALL ON FUNCTION public.ueradar_claim_search_lane(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ueradar_release_search_lane(uuid, text, text, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ueradar_claim_search_lane(uuid, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.ueradar_release_search_lane(uuid, text, text, timestamptz, timestamptz) TO service_role;