# Arquitetura do Finance OS

## 1. Visão geral

| Camada | Escolha | Por quê |
|---|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript | Server Components buscam dados no servidor; Server Actions validam no servidor. |
| UI | Tailwind CSS 4 + shadcn/ui (Radix) + Lucide | Componentes acessíveis, código no projeto (`src/components/ui`). |
| Gráficos | Recharts | Fase 6. |
| Formulários | React Hook Form + Zod | O mesmo schema Zod valida no cliente e no servidor. |
| Banco/Auth | Supabase (Postgres + Auth + RLS) | Isolamento garantido no banco, não no frontend. |
| Testes | Vitest + PGlite (Postgres real em WASM) | Testa as regras RLS sem Docker. |
| Deploy | Vercel | Fase 7. |

```
src/
  app/                 rotas (App Router)
    (app)/             área logada: layout com sidebar/nav inferior
      page.tsx         Dashboard
      transacoes/ contas/ cartoes/ contas-a-pagar/ metas/ orcamentos/ relatorios/ configuracoes/
    manifest.ts        PWA
  components/
    ui/                componentes base (shadcn/ui)
    layout/            sidebar, navegação inferior, seletor de visão, botão "Nova transação"
    shared/            cards, estados vazios, skeletons, modal de confirmação
    pwa/               registro do service worker
  config/              nome do app e menu (personalização em um lugar só)
  lib/                 dinheiro (centavos), datas (America/Sao_Paulo), visão
supabase/
  migrations/          SQL versionado (aplicado em ordem)
  tests/               testes do banco: RLS, isolamento, convites, idempotência
public/sw.js           service worker (sem cache de dados financeiros)
```

## 2. Modelo de dados

Arquivo: `supabase/migrations/20261115000001_initial_schema.sql`.

**Regra de propriedade** (todas as tabelas "com escopo"): `owner_user_id` (pessoal) **ou**
`household_id` (compartilhado) — exatamente um dos dois (`CHECK num_nonnulls = 1`).
`created_by` registra quem lançou e não pode ser alterado.

| Tabela | Escopo | Observações |
|---|---|---|
| profiles | o próprio usuário | criado automaticamente ao criar o usuário no Auth |
| households / household_members | membros | máx. 2 membros (gatilho com trava), 1 espaço por pessoa |
| household_invites | membros | guarda só o **hash** SHA-256 do token; uso único; expira em 72 h |
| accounts | dono ou espaço | corrente, poupança, carteira digital, dinheiro, investimentos |
| credit_cards | dono ou espaço | só os 4 últimos dígitos (opcional); nunca número completo/CVV/senha |
| categories | dono, espaço ou sistema | sem dono = categoria padrão (somente leitura); subcategoria via `parent_id` |
| transactions | dono ou espaço | receita/despesa; conta **ou** cartão; parcela; recorrência; idempotência |
| expense_splits | via transação | divisão em centavos por pessoa |
| transfers | via contas | não é receita/despesa; pode ligar conta pessoal ↔ conjunta |
| installment_purchases | dono ou espaço | as parcelas são linhas de `transactions` (`installment_number`) |
| credit_card_statements | via cartão | uma por cartão e mês (`UNIQUE`) |
| statement_payments | via fatura | pagamento parcial ou total, saindo de uma conta |
| recurring_rules / recurring_occurrences | dono ou espaço / via regra | `UNIQUE (rule_id, due_on)` impede duplicar ocorrência |
| financial_goals / goal_contributions | dono ou espaço / via meta | aporte e retirada não são despesa |
| budgets | dono ou espaço | um por categoria e mês (`UNIQUE NULLS NOT DISTINCT`) |
| audit_logs | escopo do registro | gravado só por gatilho; histórico de alterações |

Ajuste em relação à sugestão original: **não existe tabela `installments` separada**. Cada parcela
já é uma transação (despesa no cartão) com `installment_purchase_id` + `installment_number`, o que
evita ter o mesmo valor em dois lugares.

### Dinheiro e datas
- Todo valor é `bigint` em **centavos** (`*_cents`). Teste automático garante isso.
- Parcelas: `splitCents` divide o total e coloca os centavos que sobram nas **primeiras** parcelas
  (R$ 10,00 em 3x = 3,34 + 3,33 + 3,33). Soma sempre bate.
- Datas financeiras são `date` (sem fuso). "Hoje" é calculado em America/Sao_Paulo.
- Somar meses limita ao fim do mês (31/01 + 1 mês = 28/02) e mantém o "dia âncora".

### Competência × caixa (regras documentadas)
- `occurred_on` = **competência** (quando a compra/receita aconteceu). Relatórios de gastos por mês e
  orçamentos usam competência.
- `paid_on` = **caixa** (quando o dinheiro saiu/entrou na conta). Saldo de conta usa caixa.
- **Compra no cartão** é a despesa (competência = data da compra; entra na fatura certa). Ela
  **não** altera o saldo da conta.
- **Pagamento da fatura** é liquidação: tira dinheiro da conta, mas **não** é uma segunda despesa.
- **Transferências** e **aportes em metas** não são receita nem despesa.
- Saldo de conta = saldo inicial + receitas pagas − despesas pagas (da conta) − transferências
  enviadas + transferências recebidas − pagamentos de fatura (calculado nas Fases 3/4).

## 3. Regras de acesso (RLS)

- RLS ligado em **todas** as tabelas (teste automático verifica).
- `can_access(owner, household)` = sou o dono **ou** sou membro do espaço.
- Tabelas filhas herdam do pai (`can_access_card`, `can_access_statement`, ...).
- Transferência: vê quem acessa uma das pontas; cria/edita só quem acessa as duas.
- Gatilho de **mesmo escopo**: uma transação pessoal não pode usar conta/cartão/categoria do espaço
  (nem de outra pessoa), e vice-versa. O responsável precisa ser o dono ou membro do espaço.
- Visitante não logado (`anon`): sem permissão em nenhuma tabela.
- Espaço, membros e convites só mudam pelas funções `create_household`,
  `create_household_invite`, `accept_household_invite` (atômicas, com trava).
- A visão Pessoal/Compartilhado/Consolidado é só um filtro de interface; a segurança é o RLS.

## 4. Fases

| Fase | Conteúdo | Situação |
|---|---|---|
| 1 Fundação | projeto, design system, layout, navegação, componentes, utilitários de dinheiro/data, modelo de dados + RLS testados | **feito** |
| 2 Auth e banco | login sem cadastro público, logout, proteção de rotas (`proxy.ts` + DAL `lib/auth.ts`), perfil, troca de senha, criar espaço, convite por link | **feito** (falta você criar o projeto Supabase: `docs/SUPABASE.md`) |
| 3 Núcleo financeiro | contas (com extrato e conferência de saldo), categorias e subcategorias, lançamentos com busca/filtros/ordenação, transferências, saldos, divisão de despesas, histórico, função atômica `save_transaction` | **feito** |
| 4 Cartões | cartões com limite, faturas (fechamento/vencimento), compras parceladas, pagamentos parciais | **feito** |
| 5 Planejamento | contas a pagar com calendário e atrasadas, metas com aporte mensal e estimativa, orçamentos com alertas e comparação | **feito** |
| 6 Dashboard e relatórios | indicadores com comparação, gráficos (receitas x despesas, categorias, saldo), próximos vencimentos, faturas, metas, alertas; relatórios por período com exportação CSV | **feito** |
| 7 Qualidade e entrega | mais testes (inclusive contra Supabase local), revisão de segurança, PWA, documentação, deploy na Vercel | |

## 5. Riscos técnicos e como estão tratados

| Risco | Mitigação |
|---|---|
| Usuário A ver dados de B | RLS em todas as tabelas + testes de isolamento (`supabase/tests/rls.test.ts`), incluindo teste que sabotado falha. |
| Chave `service_role` vazar | Nunca usada no cliente; só variáveis `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` no navegador. |
| Erro de arredondamento | Centavos inteiros em todo lugar; `parseBRL` converte texto sem passar por float. |
| Lançamento duplicado (duplo clique, rede) | `idempotency_key` com `UNIQUE (created_by, idempotency_key)`; ocorrências com `UNIQUE (rule_id, due_on)`. |
| Inconsistência em operações com várias linhas (parcelamento, pagamento de fatura) | Funções Postgres em transação única (Fases 3/4). |
| Data "pulando" um dia por fuso | `date` puro no banco; "hoje" sempre em America/Sao_Paulo; testes de virada de mês/ano. |
| Corrida ao entrar no espaço (3º membro) | Gatilho trava o espaço (`FOR UPDATE`) e conta membros. |
| Convite interceptado/reutilizado | Token aleatório de 256 bits, só hash no banco, uso único, expira em 72 h, mensagem de erro genérica. |
| Dados financeiros em cache do celular | Service worker só guarda `/_next/static/*` e o ícone; páginas e APIs nunca. |
| Cadastro de estranhos | Desligar "Allow new users to sign up" no Supabase; os 2 usuários são criados pelo painel. |
| Testes de banco não são o Supabase completo | PGlite simula `auth.uid()`; na Fase 7 rodar os mesmos testes contra `supabase start`. |

## 6. Autenticação (Fase 2)

- **Três barreiras**: `src/proxy.ts` (manda quem não está logado para `/login` e renova a sessão),
  `src/lib/auth.ts` (DAL: toda leitura/ação confirma o usuário com `getClaims()` no servidor) e o
  **RLS** no banco (a barreira definitiva).
- **Server Actions** validam tudo com Zod (`src/lib/validation/auth.ts`) antes de tocar no banco.
- **Login**: mensagem genérica (não revela se o e-mail existe); logs só com código do erro.
  Limite de tentativas é o do próprio Supabase Auth.
- **Troca de senha** exige a senha atual.
- **Convite**: o link é `/convite#<código>`. O código fica depois do `#`, parte que o navegador
  não envia ao servidor na URL (não aparece em logs); ele vai só no corpo do formulário.
- **`?next=`** depois do login só aceita caminhos internos (`safeNextPath`), contra open redirect.
- Com `cacheComponents`, quem lê a sessão fica dentro de `<Suspense>`. Dados financeiros
  **não** usam `use cache` (nada de dados de usuário em cache no servidor).
- Novas migrações que criarem tabelas precisam repetir `revoke ... from anon` e
  `enable row level security` (o teste `rls.test.ts` acusa se faltar RLS).

## 7. Núcleo financeiro (Fase 3)

- **Migração 0003**: categorias padrão; regra de subcategoria (1 nível, mesmo tipo e titularidade);
  view `account_balances` (`security_invoker`, então respeita o RLS de quem consulta);
  função `save_transaction` (SECURITY INVOKER: lançamento + divisão numa transação só, idempotente).
- **Saldo** (caixa): inicial + receitas pagas − despesas pagas + transferências recebidas −
  enviadas − pagamentos de fatura. Pendentes aparecem separados ("com pendentes").
- **Resumo do mês** (competência): soma pela data do lançamento, pagas e pendentes.
- **Divisão**: só em despesa compartilhada; meio a meio, percentual ou valor, sempre convertida em
  centavos pelo método do maior resto (`splitByWeights`), e o banco confere que a soma bate.
- **Idempotência**: cada formulário aberto gera uma chave; reenviar devolve o mesmo registro.
- **Exclusões**: conta com lançamentos não pode ser excluída (arquivar); categoria excluída deixa os
  lançamentos "sem categoria". Tudo fica em `audit_logs` e aparece no "Histórico" do lançamento.
- **Visões**: Pessoal filtra por `owner_user_id`, Compartilhado por `household_id`, Consolidado não
  filtra (o RLS já devolve só o que é seu + o compartilhado). Trocar a visão recarrega os dados.
- Lançamentos de cartão aparecem nas listas mas são editados no módulo de cartões (Fase 4).

## 8. Cartões (Fase 4)

- Migração 0004: `create_card_purchase` (compra + parcelas nas faturas certas, atômica e idempotente),
  `pay_statement` (pagamento parcial/total com trava e limite do que falta), `delete_card_purchase`
  (bloqueado se alguma fatura da compra já tem pagamento), view `statement_summaries`.
- Fatura: compra antes do dia de fechamento entra no mês; no dia ou depois, no mês seguinte.
  Vencimento no mesmo mês se dia de vencimento > fechamento; senão, no mês seguinte.
- Situação (aberta/fechada/paga em parte/paga) calculada na hora (`statementState`).
- Limite em aberto = soma das faturas − pagamentos. Pagamento só mexe no saldo da conta.

## 9. Planejamento (Fase 5)

- Recorrências: datas calculadas da regra (`occurrenceDates`); só se grava ocorrência paga, pulada
  ou com valor ajustado. `pay_occurrence` grava ocorrência + lançamento juntos (UNIQUE impede pagar 2x);
  excluir o lançamento devolve a ocorrência para "a pagar". Editar a série vale para as próximas.
- Metas: `add_goal_movement` (retirada ≤ guardado, idempotente); dinheiro reservado, não é despesa.
  Aporte mensal necessário = falta ÷ meses até o prazo (arredonda para cima); estimativa pela média
  dos aportes dos últimos 3 meses.
- Orçamentos: gasto por competência; subcategoria soma na mãe; alerta em 80% e acima de 100%;
  comparação com o mês anterior; copiar orçamentos do mês anterior.

## 10. Dashboard e relatórios (Fase 6)

- `lib/finance/analytics-math.ts` (puro, testado): séries mensais, categorias (subcategoria soma na mãe,
  excesso vira "Outras"), evolução do saldo andando para trás a partir do saldo atual, CSV seguro.
- Paleta dos gráficos validada para daltonismo/contraste: receitas `#4a8ae0`, despesas `#e0535f`.
  Categorias em barras horizontais com nome e valor (sem pizza).
- CSV: `/relatorios/exportar?de=AAAA-MM&ate=AAAA-MM`, separador ";", vírgula decimal, BOM, proteção
  contra fórmulas, `Cache-Control: no-store`, respeita login, visão e RLS.
- Limite conhecido: a curva de saldo ignora transferências e pagamentos de fatura (aproximação).
