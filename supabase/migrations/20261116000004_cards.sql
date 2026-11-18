-- =============================================================================
-- Finance OS · Migração 0004 · Cartões: faturas, compras parceladas e pagamentos
-- Regras:
--   * Compra feita ANTES do dia de fechamento entra na fatura do mês; no dia do
--     fechamento ou depois, entra na fatura do mês seguinte.
--   * Vencimento: se o dia de vencimento é maior que o de fechamento, vence no mesmo
--     mês da fatura; senão, no mês seguinte. Dias que não existem viram o último dia.
--   * Parcelas: R$ 1.200 em 12x = 12 de R$ 100; centavos que sobram vão para as primeiras.
--     A parcela N cai na fatura N-1 meses depois; a competência dela é a data da compra
--     + N-1 meses.
--   * Compra no cartão é a despesa; pagamento da fatura só tira o dinheiro da conta.
-- =============================================================================

-- Mês de referência (1º dia) da fatura em que uma compra cai.
create function public.card_statement_month(p_closing_day int, p_date date)
returns date language plpgsql immutable set search_path = '' as $$
declare
  m date := date_trunc('month', p_date)::date;
  closing date := m + (least(p_closing_day, extract(day from (m + interval '1 month' - interval '1 day'))::int) - 1);
begin
  return case when p_date < closing then m else (m + interval '1 month')::date end;
end $$;

-- Cria (se faltar) e devolve a fatura do cartão para o mês. Roda com o RLS de quem chama.
create function public.ensure_statement(p_card_id uuid, p_month date)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
begin
  insert into public.credit_card_statements (credit_card_id, reference_month, closing_date, due_date)
  select
    c.id,
    p_month,
    p_month + (least(c.closing_day, extract(day from (p_month + interval '1 month' - interval '1 day'))::int) - 1),
    case
      when c.due_day > c.closing_day then
        p_month + (least(c.due_day, extract(day from (p_month + interval '1 month' - interval '1 day'))::int) - 1)
      else
        (p_month + interval '1 month')::date
          + (least(c.due_day, extract(day from (p_month + interval '2 month' - interval '1 day'))::int) - 1)
    end
  from public.credit_cards c
  where c.id = p_card_id
  on conflict (credit_card_id, reference_month) do nothing;

  select s.id into v_id from public.credit_card_statements s
  where s.credit_card_id = p_card_id and s.reference_month = p_month;
  if v_id is null then raise exception 'Cartão não encontrado' using errcode = '22023'; end if;
  return v_id;
end $$;

-- Compra no cartão (à vista = 1 parcela). Atômica e idempotente.
create function public.create_card_purchase(
  p_card_id uuid,
  p_description text,
  p_total_cents bigint,
  p_installments int,
  p_purchased_on date,
  p_category_id uuid,
  p_idempotency_key uuid
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  c public.credit_cards;
  v_id uuid;
  base date;
  part bigint;
  rem bigint;
  i int;
begin
  select * into c from public.credit_cards where id = p_card_id;
  if c.id is null then raise exception 'Cartão não encontrado' using errcode = '22023'; end if;
  if c.status <> 'active' then raise exception 'Este cartão está arquivado' using errcode = '22023'; end if;
  if p_installments is null or p_installments < 1 or p_installments > 72 then
    raise exception 'Número de parcelas deve ficar entre 1 e 72' using errcode = '22023';
  end if;

  insert into public.installment_purchases (
    owner_user_id, household_id, credit_card_id, category_id, description,
    total_cents, installments_count, purchased_on, idempotency_key
  ) values (
    c.owner_user_id, c.household_id, c.id, p_category_id, p_description,
    p_total_cents, p_installments, p_purchased_on, p_idempotency_key
  )
  on conflict (created_by, idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    select ip.id into v_id from public.installment_purchases ip
    where ip.created_by = (select auth.uid()) and ip.idempotency_key = p_idempotency_key;
    return v_id;
  end if;

  base := public.card_statement_month(c.closing_day, p_purchased_on);
  part := p_total_cents / p_installments;
  rem := p_total_cents - part * p_installments;
  for i in 1..p_installments loop
    insert into public.transactions (
      owner_user_id, household_id, type, amount_cents, description, category_id, occurred_on,
      credit_card_id, statement_id, installment_purchase_id, installment_number, status
    ) values (
      c.owner_user_id, c.household_id, 'expense', part + case when i <= rem then 1 else 0 end,
      p_description, p_category_id, (p_purchased_on + make_interval(months => i - 1))::date,
      c.id, public.ensure_statement(c.id, (base + make_interval(months => i - 1))::date), v_id, i, 'pending'
    );
  end loop;
  return v_id;
end $$;

-- Exclui a compra inteira (todas as parcelas), se nenhuma fatura dela tiver pagamento.
create function public.delete_card_purchase(p_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if exists (
    select 1 from public.transactions t
    join public.statement_payments sp on sp.statement_id = t.statement_id
    where t.installment_purchase_id = p_id
  ) then
    raise exception 'Esta compra está em uma fatura que já tem pagamento; não dá para excluir' using errcode = '23514';
  end if;
  delete from public.installment_purchases where id = p_id;
  if not found then raise exception 'Compra não encontrada' using errcode = '22023'; end if;
end $$;

-- Pagamento (parcial ou total) de fatura. Trava a fatura para evitar pagar duas vezes.
create function public.pay_statement(
  p_statement_id uuid,
  p_account_id uuid,
  p_amount_cents bigint,
  p_paid_on date,
  p_idempotency_key uuid
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
  v_total bigint;
  v_paid bigint;
begin
  perform 1 from public.credit_card_statements where id = p_statement_id for update;
  if not found then raise exception 'Fatura não encontrada' using errcode = '22023'; end if;

  select sp.id into v_id from public.statement_payments sp
  where sp.created_by = (select auth.uid()) and sp.idempotency_key = p_idempotency_key;
  if v_id is not null then return v_id; end if;

  select coalesce(sum(amount_cents), 0) into v_total from public.transactions where statement_id = p_statement_id;
  select coalesce(sum(amount_cents), 0) into v_paid from public.statement_payments where statement_id = p_statement_id;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > v_total - v_paid then
    raise exception 'O valor precisa ser maior que zero e no máximo o que falta pagar' using errcode = '22023';
  end if;

  insert into public.statement_payments (statement_id, account_id, amount_cents, paid_on, idempotency_key)
  values (p_statement_id, p_account_id, p_amount_cents, p_paid_on, p_idempotency_key)
  returning id into v_id;
  return v_id;
end $$;

-- Total e pago de cada fatura (respeita o RLS de quem consulta).
create view public.statement_summaries with (security_invoker = true) as
select
  s.id,
  s.credit_card_id,
  s.reference_month,
  s.closing_date,
  s.due_date,
  coalesce((select sum(t.amount_cents) from public.transactions t where t.statement_id = s.id), 0)::bigint as total_cents,
  coalesce((select sum(p.amount_cents) from public.statement_payments p where p.statement_id = s.id), 0)::bigint as paid_cents
from public.credit_card_statements s;

revoke all on public.statement_summaries from anon;
grant select on public.statement_summaries to authenticated;

revoke execute on function public.card_statement_month(int, date) from public, anon;
revoke execute on function public.ensure_statement(uuid, date) from public, anon;
revoke execute on function public.create_card_purchase(uuid, text, bigint, int, date, uuid, uuid) from public, anon;
revoke execute on function public.delete_card_purchase(uuid) from public, anon;
revoke execute on function public.pay_statement(uuid, uuid, bigint, date, uuid) from public, anon;
grant execute on function
  public.card_statement_month(int, date), public.ensure_statement(uuid, date),
  public.create_card_purchase(uuid, text, bigint, int, date, uuid, uuid),
  public.delete_card_purchase(uuid), public.pay_statement(uuid, uuid, bigint, date, uuid)
to authenticated;
