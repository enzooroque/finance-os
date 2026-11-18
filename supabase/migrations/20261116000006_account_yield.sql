-- Finance OS · Migração 0006 · Taxa de rendimento da conta (para a estimativa por dia útil).
-- Em pontos-base ao ano: 1040 = 10,40% a.a. Nulo = conta sem rendimento.
alter table public.accounts
  add column if not exists yield_annual_bp integer check (yield_annual_bp between 0 and 10000);
