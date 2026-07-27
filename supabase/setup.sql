-- Big Two Vakantiestand – Supabase-installatie
-- Voer dit hele bestand uit in: Supabase > SQL Editor > New query.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.big2_groups (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  name text not null check (char_length(name) between 2 and 80),
  pin_hash text not null,
  admin_pin_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.big2_players (
  id uuid primary key default extensions.gen_random_uuid(),
  group_id uuid not null references public.big2_groups(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 40),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists big2_players_group_name_unique on public.big2_players (group_id, lower(name));

create table if not exists public.big2_games (
  id uuid primary key default extensions.gen_random_uuid(),
  group_id uuid not null references public.big2_groups(id) on delete cascade,
  played_at timestamptz not null default now(),
  entered_by uuid not null references public.big2_players(id),
  winner uuid not null references public.big2_players(id),
  entries jsonb not null check (jsonb_typeof(entries) = 'array'),
  note text check (char_length(note) <= 160),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists big2_games_group_played_at_idx on public.big2_games(group_id, played_at desc) where deleted_at is null;

alter table public.big2_groups enable row level security;
alter table public.big2_players enable row level security;
alter table public.big2_games enable row level security;
revoke all on public.big2_groups, public.big2_players, public.big2_games from anon, authenticated;

create or replace function public.big2_penalty(p_cards integer)
returns integer language sql immutable strict set search_path = public as $$
  select case when p_cards = 13 then 39 when p_cards >= 10 then p_cards * 2 else p_cards end;
$$;

create or replace function public.big2_group_id(p_slug text, p_pin text, p_admin boolean default false)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_group public.big2_groups%rowtype;
begin
  select * into v_group from public.big2_groups where slug = lower(trim(p_slug));
  if not found then raise exception 'Groep niet gevonden'; end if;
  if p_pin is null or p_pin = '' then raise exception 'Code ontbreekt'; end if;
  if p_admin then
    if extensions.crypt(p_pin, v_group.admin_pin_hash) <> v_group.admin_pin_hash then raise exception 'Beheerderscode onjuist'; end if;
  else
    if extensions.crypt(p_pin, v_group.pin_hash) <> v_group.pin_hash then raise exception 'Groepscode onjuist'; end if;
  end if;
  return v_group.id;
end;
$$;

create or replace function public.big2_state(p_group_id uuid)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'group', (select jsonb_build_object('id', g.id, 'slug', g.slug, 'name', g.name) from public.big2_groups g where g.id = p_group_id),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'active', p.active) order by p.active desc, lower(p.name))
      from public.big2_players p where p.group_id = p_group_id
    ), '[]'::jsonb),
    'games', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'played_at', x.played_at, 'created_at', x.created_at,
        'entered_by', x.entered_by, 'winner', x.winner, 'entries', x.entries, 'note', x.note
      ) order by x.played_at desc, x.created_at desc)
      from public.big2_games x where x.group_id = p_group_id and x.deleted_at is null
    ), '[]'::jsonb)
  );
$$;

create or replace function public.big2_bootstrap(p_slug text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_group_id uuid;
begin
  v_group_id := public.big2_group_id(p_slug, p_pin, false);
  return public.big2_state(v_group_id);
end;
$$;

create or replace function public.big2_add_game(
  p_slug text, p_pin text, p_entered_by uuid, p_winner uuid, p_entries jsonb, p_note text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_group_id uuid;
  v_count integer;
  v_unique integer;
  v_invalid integer;
  v_winner_rows integer;
  v_normalized jsonb;
begin
  v_group_id := public.big2_group_id(p_slug, p_pin, false);
  if jsonb_typeof(p_entries) <> 'array' then raise exception 'Ongeldige spelerslijst'; end if;

  select count(*), count(distinct e.player_id),
         count(*) filter (where e.cards < 0 or e.cards > 13),
         count(*) filter (where e.player_id = p_winner and e.cards = 0)
  into v_count, v_unique, v_invalid, v_winner_rows
  from jsonb_to_recordset(p_entries) as e(player_id uuid, cards integer);

  if v_count < 2 or v_count > 8 or v_count <> v_unique then raise exception 'Selecteer 2 tot 8 unieke spelers'; end if;
  if v_invalid > 0 or v_winner_rows <> 1 then raise exception 'Ongeldige kaartenaantallen of winnaar'; end if;
  if exists (select 1 from jsonb_to_recordset(p_entries) as e(player_id uuid, cards integer) where e.player_id <> p_winner and (e.cards < 1 or e.cards > 13)) then
    raise exception 'Verliezers moeten 1 tot 13 kaarten hebben';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_entries) as e(player_id uuid, cards integer)
    left join public.big2_players p on p.id = e.player_id and p.group_id = v_group_id and p.active
    where p.id is null
  ) then raise exception 'Een geselecteerde speler is niet actief'; end if;
  if not exists (select 1 from public.big2_players where id = p_entered_by and group_id = v_group_id and active) then raise exception 'Ongeldige invoerder'; end if;

  select jsonb_agg(jsonb_build_object('player_id', e.player_id, 'cards', e.cards, 'penalty', public.big2_penalty(e.cards)) order by e.cards)
  into v_normalized from jsonb_to_recordset(p_entries) as e(player_id uuid, cards integer);

  insert into public.big2_games(group_id, entered_by, winner, entries, note)
  values (v_group_id, p_entered_by, p_winner, v_normalized, nullif(trim(p_note), ''));
  return public.big2_state(v_group_id);
end;
$$;

create or replace function public.big2_admin_add_player(p_slug text, p_admin_pin text, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_group_id uuid;
begin
  v_group_id := public.big2_group_id(p_slug, p_admin_pin, true);
  if char_length(trim(p_name)) < 2 then raise exception 'Naam is te kort'; end if;
  insert into public.big2_players(group_id, name) values (v_group_id, trim(p_name));
  return public.big2_state(v_group_id);
exception when unique_violation then raise exception 'Deze speler bestaat al';
end;
$$;

create or replace function public.big2_admin_set_player_active(p_slug text, p_admin_pin text, p_player_id uuid, p_active boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_group_id uuid;
begin
  v_group_id := public.big2_group_id(p_slug, p_admin_pin, true);
  update public.big2_players set active = p_active where id = p_player_id and group_id = v_group_id;
  if not found then raise exception 'Speler niet gevonden'; end if;
  return public.big2_state(v_group_id);
end;
$$;

create or replace function public.big2_admin_delete_game(p_slug text, p_admin_pin text, p_game_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_group_id uuid;
begin
  v_group_id := public.big2_group_id(p_slug, p_admin_pin, true);
  update public.big2_games set deleted_at = now() where id = p_game_id and group_id = v_group_id and deleted_at is null;
  if not found then raise exception 'Potje niet gevonden'; end if;
  return public.big2_state(v_group_id);
end;
$$;

revoke all on function public.big2_penalty(integer) from public;
revoke all on function public.big2_group_id(text,text,boolean) from public;
revoke all on function public.big2_state(uuid) from public;
revoke all on function public.big2_bootstrap(text,text) from public;
revoke all on function public.big2_add_game(text,text,uuid,uuid,jsonb,text) from public;
revoke all on function public.big2_admin_add_player(text,text,text) from public;
revoke all on function public.big2_admin_set_player_active(text,text,uuid,boolean) from public;
revoke all on function public.big2_admin_delete_game(text,text,uuid) from public;

grant execute on function public.big2_bootstrap(text,text) to anon, authenticated;
grant execute on function public.big2_add_game(text,text,uuid,uuid,jsonb,text) to anon, authenticated;
grant execute on function public.big2_admin_add_player(text,text,text) to anon, authenticated;
grant execute on function public.big2_admin_set_player_active(text,text,uuid,boolean) to anon, authenticated;
grant execute on function public.big2_admin_delete_game(text,text,uuid) to anon, authenticated;

-- Maak nu één groep aan. Verander naam, slug en codes voordat je dit uitvoert.
-- De groepscode deel je met iedereen. De beheerderscode houd je voor jezelf.
insert into public.big2_groups(slug, name, pin_hash, admin_pin_hash)
values (
  'vakantie-2026',
  'Big Two Vakantiestand 2026',
  extensions.crypt('2468', extensions.gen_salt('bf')),
  extensions.crypt('9876', extensions.gen_salt('bf'))
)
on conflict (slug) do nothing;
