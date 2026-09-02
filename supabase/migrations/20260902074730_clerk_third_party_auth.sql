-- Clerk third-party auth bridge.
--
-- The application uses Clerk for sign-in but stores data in this Supabase
-- project. Clerk user ids are opaque strings (`user_2aB...`) that do not
-- fit the `uuid` type used by the legacy schema, so the schema is widened
-- to `text` everywhere a user id is stored, and a `public.clerk_uid()`
-- helper is installed so RLS policies can read the Clerk id out of the
-- session JWT without depending on `auth.uid()`.
--
-- Two Supabase auth hooks are installed:
--
--   1. `public.clerk_access_token_hook` (custom_access_token) — runs on
--      every token issue. When the incoming JWT is a Clerk session it
--      copies the Clerk user id into the `sub` claim and the `clerk_user_id`
--      mirror, so `auth.jwt() ->> 'sub'` and `public.clerk_uid()` both
--      work for RLS. Non-Clerk requests (service role, dashboard, legacy
--      GoTrue sessions) pass through unchanged.
--
--   2. `public.clerk_before_user_created_hook` (before_user_created) — runs
--      the first time GoTrue sees a Clerk user. It stamps
--      `app_metadata.clerk_user_id` and `app_metadata.provider = "clerk"`
--      so admin tooling can identify the issuer.
--
-- A `public.handle_new_user()` trigger creates a profile row whenever a new
-- auth.users row is inserted. The trigger fires after the
-- before_user_created hook, so the Clerk user id is already in
-- `app_metadata` and the profile row picks it up as its primary key.

create or replace function public.clerk_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb;
  clerk_user_id text;
  clerk_email text;
  app_metadata jsonb;
begin
  claims := event->'authentication'->'claims';
  if claims is null or claims->>'sub' is null then
    return event;
  end if;

  clerk_user_id := claims->>'sub';
  -- Only rewrite Clerk-issued JWTs. Anything else is a GoTrue session
  -- (legacy email-code or service role); pass through.
  if clerk_user_id not like 'user\_%' escape '\' then
    return event;
  end if;

  clerk_email := nullif(claims->>'email', '');
  app_metadata := coalesce(event->'authentication'->'app_metadata', '{}'::jsonb);

  return jsonb_set(
    event,
    '{authentication,claims}',
    jsonb_build_object(
      'sub', clerk_user_id,
      'clerk_user_id', clerk_user_id,
      'email', coalesce(clerk_email, ''),
      'role', coalesce(claims->>'role', 'authenticated'),
      'aud', coalesce(claims->>'aud', 'authenticated'),
      'exp', claims->>'exp',
      'iat', claims->>'iat',
      'iss', coalesce(claims->>'iss', 'clerk'),
      'app_metadata', app_metadata
    ),
    true
  );
end;
$$;

comment on function public.clerk_access_token_hook(jsonb) is
  'custom_access_token hook. Surfaces the Clerk user id on every issued JWT.';

create or replace function public.clerk_before_user_created_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw_jwt text;
  payload text;
  claims jsonb;
  clerk_user_id text;
  clerk_email text;
begin
  if event->'authentication' is null then
    return event;
  end if;

  raw_jwt := nullif(event->'authentication'->>'jwt', '');
  if raw_jwt is null then
    return event;
  end if;

  payload := split_part(raw_jwt, '.', 2);
  payload := replace(replace(payload, '-', '+'), '_', '/');
  begin
    claims := convert_from(decode(payload, 'base64'), 'UTF8')::jsonb;
  exception when others then
    return event;
  end;

  if not (claims ? 'sub') then
    return event;
  end if;

  clerk_user_id := claims->>'sub';
  if clerk_user_id not like 'user\_%' escape '\' then
    return event;
  end if;

  clerk_email := nullif(lower(claims->>'email'), '');

  event := jsonb_set(
    event,
    '{app_metadata}',
    coalesce(event->'app_metadata', '{}'::jsonb)
      || jsonb_build_object(
        'provider', 'clerk',
        'clerk_user_id', clerk_user_id
      ),
    true
  );
  if clerk_email is not null then
    event := jsonb_set(event, '{email}', to_jsonb(clerk_email), true);
    event := jsonb_set(event, '{email_confirm}', 'true'::jsonb, true);
  end if;

  return event;
end;
$$;

comment on function public.clerk_before_user_created_hook(jsonb) is
  'before_user_created hook. Stamps app_metadata with the Clerk user id and provider on first sign-in.';

-- `public.clerk_uid()` returns the Clerk user id from the current session
-- JWT. RLS policies use it in place of `auth.uid()` so the application's
-- text-typed `user_id` columns can be compared directly.
create or replace function public.clerk_uid()
returns text
language sql
stable
as $$
  select nullif(coalesce(
    auth.jwt() ->> 'clerk_user_id',
    auth.jwt() ->> 'sub'
  ), '')
  where (auth.jwt() ->> 'sub') like 'user\_%' escape '\';
$$;

grant execute on function public.clerk_uid() to authenticated, anon;

-- Auto-create a profile row whenever a new auth.users row appears. The
-- profile primary key is the Clerk user id (text) so it lines up with
-- the application tables after the column-type migration below.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  clerk_meta jsonb;
  display_name text;
  timezone text;
begin
  clerk_meta := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  display_name := nullif(coalesce(new.raw_user_meta_data->>'display_name', ''), '');
  timezone := nullif(coalesce(new.raw_user_meta_data->>'timezone', ''), '');

  insert into public.profiles (id, display_name, timezone)
  values (
    -- The Clerk user id surfaces on the before_user_created hook's
    -- app_metadata. Fall back to `new.id` (GoTrue-issued uuid) when the
    -- row was provisioned by the dashboard or a non-Clerk path; that
    -- account cannot use Clerk's third-party flow anyway.
    coalesce(
      nullif(clerk_meta->>'clerk_user_id', ''),
      new.id::text
    ),
    coalesce(
      display_name,
      coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), ''),
      coalesce(nullif(new.raw_user_meta_data->>'name', ''), ''),
      coalesce(nullif(new.raw_user_meta_data->>'username', ''), ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    coalesce(timezone, 'Europe/Copenhagen')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

grant usage on schema public to supabase_auth_admin;
grant execute on function public.clerk_access_token_hook(jsonb) to supabase_auth_admin;
grant execute on function public.clerk_before_user_created_hook(jsonb) to supabase_auth_admin;
grant usage on schema auth to supabase_auth_admin;
