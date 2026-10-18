create role anon; create role authenticated;
    create table public.big2_groups(id uuid primary key default gen_random_uuid(),slug text,name text,ranking_criterion text default 'average_penalty');
    create table public.big2_players(id uuid primary key default gen_random_uuid(),group_id uuid references public.big2_groups(id),name text,active boolean default true);
    create table public.big2_periods(id uuid primary key default gen_random_uuid(),group_id uuid references public.big2_groups(id),name text);
    create table public.big2_games(id uuid primary key default gen_random_uuid(),group_id uuid references public.big2_groups(id),note text);
    create function public.big2_public_group_id(p_slug text) returns uuid language sql as $$select id from public.big2_groups where slug=p_slug$$;
    create function public.big2_admin_group_id(p_slug text,p_pin text) returns uuid language plpgsql as $$begin
      if p_pin is distinct from 'test-pin' then raise exception 'Onjuiste beheerderscode'; end if;
      return public.big2_public_group_id(p_slug); end$$;
    insert into public.big2_groups(slug,name) values('test-groep','Gewone groep'),('andere-groep','Andere groep');
    insert into public.big2_players(group_id,name) select id,'Alice' from public.big2_groups where slug='test-groep';
    insert into public.big2_players(group_id,name) select id,'Bob' from public.big2_groups where slug='test-groep';
    insert into public.big2_players(group_id,name) select id,'Privé naam andere groep' from public.big2_groups where slug='andere-groep';
    insert into public.big2_games(group_id,note) select id,'Gewone uitslag' from public.big2_groups;
    insert into public.big2_periods(group_id,name) select id,'Gewone periode' from public.big2_groups;
  