REVOKE ALL ON FUNCTION public.ueradar_enforce_trial_objectives() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ueradar_enforce_trial_objectives() TO service_role;