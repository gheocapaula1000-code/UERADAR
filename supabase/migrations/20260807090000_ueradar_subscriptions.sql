-- UEradar.com: trial e stato abbonamento. Migrazione additiva e isolata.
create table if not exists public.ueradar_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'trialing'
    check (status in ('trialing','active','past_due','canceled','expired')),
  plan_code text not null default 'ueradar_pro_monthly',
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null default (now() + interval '7 days'),
  current_period_end timestamptz,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ueradar_subscriptions enable row level security;
revoke all on public.ueradar_subscriptions from anon;
grant select on public.ueradar_subscriptions to authenticated;
grant all on public.ueradar_subscriptions to service_role;

drop policy if exists "ueradar_users_read_own_subscription" on public.ueradar_subscriptions;
create policy "ueradar_users_read_own_subscription"
  on public.ueradar_subscriptions for select to authenticated
  using (auth.uid() = user_id);

insert into public.ueradar_subscriptions (user_id)
select id from auth.users
on conflict (user_id) do nothing;

create or replace function public.ueradar_create_trial_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ueradar_subscriptions (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists ueradar_trial_on_signup on auth.users;
create trigger ueradar_trial_on_signup
after insert on auth.users
for each row execute function public.ueradar_create_trial_for_new_user();
