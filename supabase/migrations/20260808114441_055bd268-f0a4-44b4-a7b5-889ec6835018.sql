ALTER TABLE public.ueradar_subscriptions
  ADD COLUMN IF NOT EXISTS last_invoice_event_at timestamptz;

-- La fattura non è più fonte di verità per lo stato: aggiorna solo i metadati
-- documentali e il proprio cursore, mai last_event_created_at.
CREATE OR REPLACE FUNCTION public.ueradar_billing_apply_invoice(_user_id uuid, _event_created_at timestamp with time zone, _subscription_id text, _invoice_url text, _tax_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _row record;
  _url text := nullif(btrim(coalesce(_invoice_url, '')), '');
  _tax text := nullif(btrim(coalesce(_tax_id, '')), '');
BEGIN
  IF _user_id IS NULL OR _event_created_at IS NULL OR coalesce(_subscription_id, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  END IF;

  SELECT * INTO _row FROM public.ueradar_subscriptions
  WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SUBSCRIPTION_ROW');
  END IF;
  IF _row.provider_subscription_id IS DISTINCT FROM _subscription_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SUBSCRIPTION_MISMATCH');
  END IF;
  -- Cursore dedicato alle fatture: indipendente dall'ordine degli eventi
  -- di subscription.
  IF _row.last_invoice_event_at IS NOT NULL
     AND _event_created_at < _row.last_invoice_event_at THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVOICE_OUT_OF_ORDER');
  END IF;

  UPDATE public.ueradar_subscriptions
  SET latest_invoice_url = coalesce(_url, latest_invoice_url),
      tax_id = coalesce(_tax, tax_id),
      last_invoice_event_at = greatest(coalesce(last_invoice_event_at, _event_created_at), _event_created_at)
  WHERE user_id = _user_id;

  RETURN jsonb_build_object('ok', true, 'code', 'INVOICE_APPLIED');
END;
$function$;

CREATE OR REPLACE FUNCTION public.ueradar_billing_apply_subscription(_user_id uuid, _event_created_at timestamp with time zone, _patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _row record;
  _new_status text := _patch->>'status';
  _new_sub text := _patch->>'provider_subscription_id';
  _new_price text := _patch->>'stripe_price_id';
  _new_plan text := _patch->>'plan_code';
BEGIN
  IF _user_id IS NULL OR _event_created_at IS NULL OR _new_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  END IF;

  -- Lock per utente: due eventi concorrenti non si sovrascrivono a metà.
  SELECT * INTO _row FROM public.ueradar_subscriptions
  WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SUBSCRIPTION_ROW');
  END IF;

  IF _row.last_event_created_at IS NOT NULL THEN
    IF _event_created_at < _row.last_event_created_at THEN
      RETURN jsonb_build_object('ok', false, 'code', 'EVENT_OUT_OF_ORDER');
    END IF;
    IF _event_created_at = _row.last_event_created_at THEN
      -- Stesso istante: un annullamento non può essere riattivato.
      IF _row.status = 'canceled' AND _new_status <> 'canceled' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'CANCELED_NOT_REACTIVATED');
      END IF;
      -- Stesso istante e snapshot canonici divergenti su abbonamento, prezzo o
      -- piano: nessuno dei due può vincere arbitrariamente.
      IF _new_status <> 'canceled' AND (
           (_new_sub IS NOT NULL AND _row.provider_subscription_id IS NOT NULL
              AND _new_sub IS DISTINCT FROM _row.provider_subscription_id)
        OR (_new_price IS NOT NULL AND _row.stripe_price_id IS NOT NULL
              AND _new_price IS DISTINCT FROM _row.stripe_price_id)
        OR (_new_plan IS NOT NULL AND _row.plan_code IS NOT NULL
              AND _new_plan IS DISTINCT FROM _row.plan_code)
      ) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'CANONICAL_CONFLICT');
      END IF;
    END IF;
  END IF;

  UPDATE public.ueradar_subscriptions
  SET status = _new_status,
      provider = coalesce(_patch->>'provider', provider),
      billing_mode = coalesce(_patch->>'billing_mode', billing_mode),
      provider_subscription_id = coalesce(_new_sub, provider_subscription_id),
      provider_customer_id = coalesce(_patch->>'provider_customer_id', provider_customer_id),
      stripe_price_id = coalesce(_new_price, stripe_price_id),
      plan_code = coalesce(_new_plan, plan_code),
      plan_seats = coalesce((_patch->>'plan_seats')::integer, plan_seats),
      cancel_at_period_end = coalesce((_patch->>'cancel_at_period_end')::boolean, cancel_at_period_end),
      current_period_end = nullif(_patch->>'current_period_end', '')::timestamptz,
      trial_consumed = coalesce((_patch->>'trial_consumed')::boolean, trial_consumed),
      last_event_created_at = _event_created_at
  WHERE user_id = _user_id;

  RETURN jsonb_build_object('ok', true, 'code', 'APPLIED');
END;
$function$;