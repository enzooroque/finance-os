-- Finance OS · Migração 0007 · Rendimento como "% do CDI" (10200 = 102% do CDI).
-- Se preenchido, vale no lugar da taxa fixa (yield_annual_bp); o CDI do dia vem do Banco Central.
alter table public.accounts
  add column if not exists yield_cdi_bp integer check (yield_cdi_bp between 0 and 50000);
