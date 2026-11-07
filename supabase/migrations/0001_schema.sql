-- ===========================================================================
-- TWIG schema: core tables, indexes, RPC helpers, RLS policies, and storage.
-- Apply in the Supabase SQL editor or with the Supabase CLI.
-- ===========================================================================

-- gen_random_uuid() is built in to Supabase (pgcrypto is preloaded).

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles (lower(email));

-- Create a profile automatically for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- datasets (public catalog)
-- ---------------------------------------------------------------------------
create table if not exists public.datasets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text not null,
  category text not null,
  price numeric(10, 2) not null check (price >= 0),
  currency text not null default 'USD',
  format text not null,
  schema_json jsonb not null default '{}'::jsonb,
  sample_data jsonb not null default '[]'::jsonb,
  storage_path text,
  source_information text,
  license_information text,
  coverage text,
  freshness text,
  methodology text,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists datasets_status_idx on public.datasets (status);
create index if not exists datasets_category_idx on public.datasets (category);
create index if not exists datasets_slug_idx on public.datasets (slug);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists datasets_touch_updated_at on public.datasets;
create trigger datasets_touch_updated_at
  before update on public.datasets
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- custom_requests
-- ---------------------------------------------------------------------------
create table if not exists public.custom_requests (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references auth.users (id) on delete cascade,
  original_prompt text not null,
  specification_json jsonb,
  estimated_price numeric(10, 2),
  currency text not null default 'USD',
  estimated_delivery_hours integer,
  status text not null default 'draft'
    check (status in ('draft', 'quoted', 'approved', 'paid', 'in_progress', 'delivered', 'cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists custom_requests_buyer_idx on public.custom_requests (buyer_id);
create index if not exists custom_requests_status_idx on public.custom_requests (status);

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references auth.users (id) on delete cascade,
  dataset_id uuid references public.datasets (id) on delete set null,
  custom_request_id uuid references public.custom_requests (id) on delete set null,
  amount numeric(10, 2) not null check (amount >= 0),
  currency text not null default 'USD',
  paypal_order_id text unique,
  paypal_capture_id text unique,
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'completed', 'failed', 'refunded', 'cancelled')),
  pricer_source text not null default 'db'
    check (pricer_source in ('db', 'quote')),
  created_at timestamptz not null default now()
);

create index if not exists orders_buyer_idx on public.orders (buyer_id);
create index if not exists orders_payment_status_idx on public.orders (payment_status);

-- ---------------------------------------------------------------------------
-- entitlements (granted access to a dataset file)
-- ---------------------------------------------------------------------------
create table if not exists public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  dataset_id uuid not null references public.datasets (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  granted_at timestamptz not null default now()
);

-- Idempotency: at most one entitlement per (order, dataset) pair.
create unique index if not exists entitlements_order_dataset_unique
  on public.entitlements (order_id, dataset_id);
create index if not exists entitlements_user_dataset_idx
  on public.entitlements (user_id, dataset_id);

-- ---------------------------------------------------------------------------
-- jobs (worker-processed collection jobs; one per custom request)
-- ---------------------------------------------------------------------------
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  custom_request_id uuid not null unique references public.custom_requests (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed')),
  progress smallint not null default 0 check (progress between 0 and 100),
  result_storage_path text,
  error_message text,
  stage text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists jobs_status_idx on public.jobs (status);
create index if not exists jobs_pending_idx
  on public.jobs (created_at) where status = 'pending';

-- ---------------------------------------------------------------------------
-- payment_events (webhook arrivals; unique event id = webhook idempotency)
-- ---------------------------------------------------------------------------
create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text,
  order_id uuid references public.orders (id) on delete set null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payment_events_order_idx on public.payment_events (order_id);

-- ===========================================================================
-- RPC helpers
-- ===========================================================================

-- Atomic job claim: exactly one worker can claim a pending job at a time.
create or replace function public.claim_job()
returns setof public.jobs
language sql
security definer
set search_path = public
as $$
  update public.jobs
  set status = 'running',
      started_at = now(),
      progress = 5,
      stage = 'claimed'
  where id = (
    select j.id
    from public.jobs j
    where j.status = 'pending'
    order by j.created_at asc
    limit 1
    for update skip locked
  )
  returning *;
$$;

-- ===========================================================================
-- Row Level Security
-- ===========================================================================

alter table public.profiles enable row level security;
alter table public.datasets enable row level security;
alter table public.orders enable row level security;
alter table public.entitlements enable row level security;
alter table public.custom_requests enable row level security;
alter table public.jobs enable row level security;
alter table public.payment_events enable row level security;

-- profiles: users see and edit only their own profile
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to public using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to public using (auth.uid() = id);

-- datasets: catalog metadata is publicly readable once published
drop policy if exists "datasets_select_published" on public.datasets;
create policy "datasets_select_published" on public.datasets
  for select to public using (status = 'published');

-- orders: buyers see only their own orders; writes happen with the
-- service-role key from trusted server code only.
drop policy if exists "orders_select_own" on public.orders;
create policy "orders_select_own" on public.orders
  for select to public using (auth.uid() = buyer_id);

-- entitlements: buyers see only their own entitlements
drop policy if exists "entitlements_select_own" on public.entitlements;
create policy "entitlements_select_own" on public.entitlements
  for select to public using (auth.uid() = user_id);

-- custom_requests: buyers see only their own requests
drop policy if exists "custom_requests_select_own" on public.custom_requests;
create policy "custom_requests_select_own" on public.custom_requests
  for select to public using (auth.uid() = buyer_id);

-- jobs: readable by the buyer of the linked custom request
drop policy if exists "jobs_select_own" on public.jobs;
create policy "jobs_select_own" on public.jobs
  for select to public using (
    exists (
      select 1 from public.custom_requests cr
      where cr.id = jobs.custom_request_id and cr.buyer_id = auth.uid()
    )
  );

-- payment_events: service-role access only (no policies granted)

-- ===========================================================================
-- Storage: private "datasets" bucket
-- ===========================================================================

insert into storage.buckets (id, name, public)
values ('datasets', 'datasets', false)
on conflict (id) do nothing;

-- Buyers may read dataset files under "<dataset-uuid>/..." if they own an
-- entitlement for that dataset.
drop policy if exists "dataset files readable by entitled buyer" on storage.objects;
create policy "dataset files readable by entitled buyer" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'datasets'
    and exists (
      select 1
      from public.entitlements e
      where e.user_id = auth.uid()
        and e.dataset_id::text = split_part(name, '/', 1)
    )
  );

-- Custom-delivery files under "<custom-request-uuid>/..." are readable by the
-- buyer who owns the custom request.
drop policy if exists "custom delivery files readable by buyer" on storage.objects;
create policy "custom delivery files readable by buyer" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'datasets'
    and exists (
      select 1
      from public.custom_requests cr
      join public.jobs j on j.custom_request_id = cr.id
      where cr.buyer_id = auth.uid()
        and cr.id::text = split_part(name, '/', 1)
        and j.result_storage_path = name
    )
  );
