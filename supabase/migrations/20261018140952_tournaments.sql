-- Standalone tournaments. Ordinary players, periods and games are never changed here.
-- Identity is deliberately based on the selected name (the group's trust model).
create schema if not exists big2_private;
revoke all on schema big2_private from public, anon, authenticated;

create table public.big2_tournaments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.big2_groups(id),
  name text not null check (char_length(name) between 2 and 20),
  viewer_token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  master_player_id uuid,
  ranking_criterion text not null check (ranking_criterion in ('average_penalty','wins','win_rate','total_penalty','games_played')),
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create unique index big2_one_active_tournament on public.big2_tournaments(group_id) where not is_archived;
create index big2_tournaments_group_archive on public.big2_tournaments(group_id, created_at desc);

create table public.big2_tournament_players (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.big2_tournaments(id),
  source_player_id uuid references public.big2_players(id) on delete set null,
  name text not null check (char_length(name) between 2 and 40),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(tournament_id, id),
  unique(tournament_id, source_player_id)
);
create unique index big2_tournament_player_name on public.big2_tournament_players(tournament_id, lower(name));
create index big2_tournament_players_source on public.big2_tournament_players(source_player_id) where source_player_id is not null;
alter table public.big2_tournaments add constraint big2_tournament_master_member
  foreign key(id, master_player_id) references public.big2_tournament_players(tournament_id, id);

create table public.big2_tournament_games (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.big2_tournaments(id),
  client_game_id uuid not null,
  entered_by uuid not null,
  winner uuid not null,
  entries jsonb not null check (jsonb_typeof(entries) = 'array'),
  note text check (char_length(note) <= 160),
  played_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  unique(tournament_id, client_game_id),
  foreign key(tournament_id, entered_by) references public.big2_tournament_players(tournament_id, id),
  foreign key(tournament_id, winner) references public.big2_tournament_players(tournament_id, id)
);
create index big2_tournament_games_recent on public.big2_tournament_games(tournament_id, played_at desc) where deleted_at is null;
create index big2_tournament_games_inputter on public.big2_tournament_games(tournament_id, entered_by);
create index big2_tournament_games_winner on public.big2_tournament_games(tournament_id, winner);

alter table public.big2_tournaments enable row level security;
alter table public.big2_tournament_players enable row level security;
alter table public.big2_tournament_games enable row level security;
revoke all on public.big2_tournaments, public.big2_tournament_players, public.big2_tournament_games from public, anon, authenticated;

create function big2_private.tournament(p_token text, p_lock boolean default false)
returns public.big2_tournaments language plpgsql set search_path = '' as $$
declare t public.big2_tournaments;
begin
  if p_lock then
    select * into t from public.big2_tournaments where viewer_token = p_token for update;
  else
    select * into t from public.big2_tournaments where viewer_token = p_token;
  end if;
  if t.id is null then raise exception 'Toernooi niet gevonden. Controleer de toernooilink.'; end if;
  return t;
end $$;

create function big2_private.tournament_state(p_id uuid)
returns jsonb language sql set search_path = '' as $$
  select jsonb_build_object(
    'group', jsonb_build_object('id',t.id,'slug','tournament-' || t.id,'name',t.name,'ranking_criterion',t.ranking_criterion),
    'tournament', jsonb_build_object('id',t.id,'name',t.name,'master_player_id',t.master_player_id,
      'is_archived',t.is_archived,'created_at',t.created_at,'archived_at',t.archived_at),
    'periods', jsonb_build_array(jsonb_build_object('id',t.id,'name',t.name,'year',extract(year from t.created_at)::int,
      'is_archived',t.is_archived,'ranking_criterion',t.ranking_criterion,'created_at',t.created_at,'archived_at',t.archived_at)),
    'players', coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'source_player_id',p.source_player_id,
      'name',p.name,'active',p.active,'created_at',p.created_at) order by lower(p.name))
      from public.big2_tournament_players p where p.tournament_id=t.id),'[]'::jsonb),
    'games', coalesce((select jsonb_agg((to_jsonb(g) - 'tournament_id') || jsonb_build_object('period_id',t.id)
      order by g.played_at desc,g.created_at desc,g.id desc) from public.big2_tournament_games g
      where g.tournament_id=t.id and g.deleted_at is null),'[]'::jsonb),
    'logs','[]'::jsonb
  ) from public.big2_tournaments t where t.id=p_id;
$$;

create function big2_private.tournament_add_players(p_tournament_id uuid, p_source_ids jsonb, p_names jsonb)
returns void language plpgsql set search_path = '' as $$
declare t public.big2_tournaments; s record; n text; v_id uuid;
begin
  select * into strict t from public.big2_tournaments where id=p_tournament_id;
  if jsonb_typeof(p_source_ids) is distinct from 'array' or jsonb_typeof(p_names) is distinct from 'array'
    then raise exception 'Ongeldige namenlijst.'; end if;
  if jsonb_array_length(p_source_ids)>100 or jsonb_array_length(p_names)>30 then raise exception 'Voeg maximaal 100 bestaande en 30 nieuwe namen tegelijk toe.'; end if;
  for s in select distinct value::uuid as id from jsonb_array_elements_text(p_source_ids) loop
    select id into v_id from public.big2_players where id=s.id and group_id=t.group_id and active;
    if v_id is null then raise exception 'Deze bestaande speler is niet beschikbaar.'; end if;
    insert into public.big2_tournament_players(tournament_id,source_player_id,name)
      select t.id,id,name from public.big2_players where id=v_id
      on conflict(tournament_id,source_player_id) do update set active=true;
  end loop;
  for n in select distinct btrim(value) from jsonb_array_elements_text(p_names) loop
    if n is null or char_length(n) not between 2 and 40 then raise exception 'Elke spelersnaam moet 2 tot 40 tekens hebben.'; end if;
    -- A returning tournament-only name is reactivated; an existing member is never silently replaced.
    insert into public.big2_tournament_players(tournament_id,name) values(t.id,n)
      on conflict(tournament_id,lower(name)) do update set active=true;
  end loop;
end $$;

create function big2_private.tournament_entries(p_tournament_id uuid, p_winner uuid, p_entries jsonb, p_active boolean)
returns jsonb language plpgsql set search_path = '' as $$
declare v_count integer; v_max integer; v_result jsonb;
begin
  if jsonb_typeof(p_entries) is distinct from 'array' then raise exception 'Ongeldige scorelijst.'; end if;
  v_count := jsonb_array_length(p_entries);
  if v_count not between 2 and 8 then raise exception 'Selecteer 2 tot 8 spelers.'; end if;
  v_max := ceil(52.0/v_count);
  if (select count(distinct (e->>'player_id')::uuid) from jsonb_array_elements(p_entries) e)<>v_count
    then raise exception 'Een speler mag maar één keer deelnemen.'; end if;
  if exists(select 1 from jsonb_array_elements(p_entries) e
    left join public.big2_tournament_players p on p.id=(e->>'player_id')::uuid and p.tournament_id=p_tournament_id
    where p.id is null or (p_active and not p.active) or e->>'cards' is null
      or (e->>'cards')::int < case when p.id=p_winner then 0 else 1 end
      or (e->>'cards')::int > v_max
      or (p.id=p_winner and (e->>'cards')::int<>0))
    then raise exception 'Controleer de deelnemers en aantallen kaarten.'; end if;
  if (select count(*) from jsonb_array_elements(p_entries) e where (e->>'player_id')::uuid=p_winner and (e->>'cards')::int=0)<>1
    then raise exception 'Kies één winnaar met nul kaarten.'; end if;
  select jsonb_agg(jsonb_build_object('player_id',(e->>'player_id')::uuid,'cards',(e->>'cards')::int,
    'penalty',case when (e->>'cards')::int>=13 then 39 when (e->>'cards')::int>=10 then (e->>'cards')::int*2 else (e->>'cards')::int end))
    into v_result from jsonb_array_elements(p_entries) e;
  return v_result;
end $$;

-- Public RPCs are the only access path; private helpers and tables are not exposed.
create function public.big2_tournament_overview(p_slug text)
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object('tournaments',coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'name',t.name,'token',t.viewer_token,'is_archived',t.is_archived,
    'created_at',t.created_at,'archived_at',t.archived_at) order by t.created_at desc),'[]'::jsonb))
  from public.big2_tournaments t where t.group_id=public.big2_public_group_id(p_slug);
$$;

create function public.big2_tournament_setup(p_slug text, p_admin_pin text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g uuid;
begin
  g:=public.big2_admin_group_id(p_slug,p_admin_pin);
  return jsonb_build_object('players',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by lower(name))
    from public.big2_players where group_id=g and active),'[]'::jsonb));
end $$;

create function public.big2_tournament_create(p_slug text, p_admin_pin text, p_master_source_id uuid,
  p_name text, p_source_ids jsonb, p_names jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g uuid; t public.big2_tournaments; m uuid;
begin
  g:=public.big2_admin_group_id(p_slug,p_admin_pin);
  if not exists(select 1 from public.big2_players where id=p_master_source_id and group_id=g and active)
    then raise exception 'Kies eerst je eigen spelersnaam. Die wordt game master.'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 2 and 20 then raise exception 'De toernooinaam moet 2 tot 20 tekens hebben.'; end if;
  insert into public.big2_tournaments(group_id,name,ranking_criterion)
    select g,btrim(p_name),ranking_criterion from public.big2_groups where id=g returning * into t;
  perform big2_private.tournament_add_players(t.id,p_source_ids || jsonb_build_array(p_master_source_id),p_names);
  select id into m from public.big2_tournament_players where tournament_id=t.id and source_player_id=p_master_source_id;
  update public.big2_tournaments set master_player_id=m where id=t.id;
  return jsonb_build_object('token',t.viewer_token,'state',big2_private.tournament_state(t.id));
exception when unique_violation then raise exception 'Er is al een actief toernooi, of deze naam is al toegevoegd.';
end $$;

create function public.big2_tournament_bootstrap(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.big2_tournaments;
begin
  t:=big2_private.tournament(p_token);
  return big2_private.tournament_state(t.id);
end $$;

create function public.big2_tournament_roster_options(p_token text, p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.big2_tournaments;
begin
  t:=big2_private.tournament(p_token);
  if p_actor_id is distinct from t.master_player_id then raise exception 'Alleen de game master kan spelers toevoegen.'; end if;
  return jsonb_build_object('players',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by lower(name))
    from public.big2_players where group_id=t.group_id and active),'[]'::jsonb));
end $$;

create function public.big2_tournament_manage(p_token text, p_actor_id uuid, p_action text,
  p_name text default null, p_source_ids jsonb default '[]', p_names jsonb default '[]', p_player_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.big2_tournaments;
begin
  t:=big2_private.tournament(p_token,true);
  if p_actor_id is distinct from t.master_player_id then raise exception 'Alleen de game master kan dit toernooi beheren.'; end if;
  if t.is_archived then raise exception 'Dit toernooi is afgesloten en alleen-lezen.'; end if;
  case p_action
    when 'rename' then
      if p_name is null or char_length(btrim(p_name)) not between 2 and 20 then raise exception 'De toernooinaam moet 2 tot 20 tekens hebben.'; end if;
      update public.big2_tournaments set name=btrim(p_name) where id=t.id;
    when 'add' then perform big2_private.tournament_add_players(t.id,p_source_ids,p_names);
    when 'remove' then
      if p_player_id=t.master_player_id then raise exception 'De game master blijft deelnemer tot het toernooi is afgesloten.'; end if;
      update public.big2_tournament_players set active=false where tournament_id=t.id and id=p_player_id;
      if not found then raise exception 'Speler niet gevonden in dit toernooi.'; end if;
    when 'close' then
      update public.big2_tournaments set is_archived=true,archived_at=now() where id=t.id;
    else raise exception 'Onbekende toernooiactie.';
  end case;
  return big2_private.tournament_state(t.id);
exception when unique_violation then raise exception 'Deze spelersnaam is al toegevoegd.';
end $$;

create function public.big2_tournament_save_game(p_token text, p_actor_id uuid, p_game_id uuid,
  p_client_game_id uuid, p_entered_by uuid, p_winner uuid, p_entries jsonb, p_note text, p_played_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.big2_tournaments; old_game public.big2_tournament_games; v_entries jsonb;
begin
  -- Serialize score writes with close/removal so an archived tournament never accepts a late write.
  t:=big2_private.tournament(p_token,true);
  if p_game_id is null and p_client_game_id is null then raise exception 'Uniek potjesnummer ontbreekt.'; end if;
  if p_game_id is null and exists(select 1 from public.big2_tournament_games where tournament_id=t.id and client_game_id=p_client_game_id)
    then return big2_private.tournament_state(t.id); end if;
  if t.is_archived then raise exception 'Dit toernooi is afgesloten. Er kunnen geen scores meer worden gewijzigd.'; end if;
  if p_note is not null and char_length(p_note)>160 then raise exception 'Een notitie mag maximaal 160 tekens bevatten.'; end if;
  if p_game_id is not null then
    if p_actor_id is distinct from t.master_player_id then raise exception 'Alleen de game master kan potjes aanpassen.'; end if;
    select * into old_game from public.big2_tournament_games where id=p_game_id and tournament_id=t.id and deleted_at is null;
    if old_game.id is null then raise exception 'Potje niet gevonden in dit toernooi.'; end if;
  else
    if not exists(select 1 from public.big2_tournament_players where id=p_actor_id and tournament_id=t.id and active)
      then raise exception 'Kies eerst je naam uit de toernooideelnemers.'; end if;
    if (select count(*) from public.big2_tournament_games where tournament_id=t.id and created_at>now()-interval '1 minute')>=20
      then raise exception 'Er zijn veel potjes tegelijk opgeslagen. Probeer het over een minuut opnieuw.'; end if;
  end if;
  v_entries:=big2_private.tournament_entries(t.id,p_winner,p_entries,p_game_id is null);
  if not exists(select 1 from jsonb_array_elements(v_entries) e where (e->>'player_id')::uuid=p_entered_by)
    then raise exception 'De invoerder moet ook deelnemen aan dit potje.'; end if;
  if p_game_id is not null and exists(select 1 from jsonb_array_elements(v_entries) e
    join public.big2_tournament_players p on p.id=(e->>'player_id')::uuid and p.tournament_id=t.id
    where not p.active and not exists(select 1 from jsonb_array_elements(old_game.entries) b where b->>'player_id'=e->>'player_id'))
    then raise exception 'Een verwijderde deelnemer kan niet aan een potje worden toegevoegd.'; end if;
  if p_game_id is null then
    insert into public.big2_tournament_games(tournament_id,client_game_id,entered_by,winner,entries,note,played_at)
      values(t.id,p_client_game_id,p_entered_by,p_winner,v_entries,nullif(btrim(p_note),''),coalesce(p_played_at,now()));
  else
    update public.big2_tournament_games set entered_by=p_entered_by,winner=p_winner,entries=v_entries,
      note=nullif(btrim(p_note),''),updated_at=now() where id=p_game_id;
  end if;
  return big2_private.tournament_state(t.id);
end $$;

create function public.big2_tournament_delete_game(p_token text, p_actor_id uuid, p_game_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.big2_tournaments;
begin
  t:=big2_private.tournament(p_token,true);
  if p_actor_id is distinct from t.master_player_id then raise exception 'Alleen de game master kan potjes verwijderen.'; end if;
  if t.is_archived then raise exception 'Dit toernooi is afgesloten en alleen-lezen.'; end if;
  update public.big2_tournament_games set deleted_at=now() where tournament_id=t.id and id=p_game_id and deleted_at is null;
  if not found then raise exception 'Potje niet gevonden in dit toernooi.'; end if;
  return big2_private.tournament_state(t.id);
end $$;

revoke all on all functions in schema big2_private from public, anon, authenticated;
revoke all on function public.big2_tournament_overview(text), public.big2_tournament_setup(text,text),
  public.big2_tournament_create(text,text,uuid,text,jsonb,jsonb), public.big2_tournament_bootstrap(text),
  public.big2_tournament_roster_options(text,uuid), public.big2_tournament_manage(text,uuid,text,text,jsonb,jsonb,uuid),
  public.big2_tournament_save_game(text,uuid,uuid,uuid,uuid,uuid,jsonb,text,timestamptz),
  public.big2_tournament_delete_game(text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.big2_tournament_overview(text), public.big2_tournament_setup(text,text),
  public.big2_tournament_create(text,text,uuid,text,jsonb,jsonb), public.big2_tournament_bootstrap(text),
  public.big2_tournament_roster_options(text,uuid), public.big2_tournament_manage(text,uuid,text,text,jsonb,jsonb,uuid),
  public.big2_tournament_save_game(text,uuid,uuid,uuid,uuid,uuid,jsonb,text,timestamptz),
  public.big2_tournament_delete_game(text,uuid,uuid) to anon, authenticated;
notify pgrst, 'reload schema';
