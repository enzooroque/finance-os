-- Finance OS · Migração 0002 · Perfis para usuários criados ANTES da migração 0001.
-- O gatilho on_auth_user_created só cobre usuários novos; isto cobre os antigos.
-- Pode rodar mais de uma vez sem efeito colateral.
insert into public.profiles (id, display_name)
select u.id, left(coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''), split_part(u.email, '@', 1), 'Usuário'), 60)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);
