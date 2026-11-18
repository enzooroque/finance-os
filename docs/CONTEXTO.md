# Finance OS — contexto para quem continuar o projeto (pessoa ou agente de IA)

App de finanças pessoais para um casal (Enzo e a esposa). **Responda sempre em português brasileiro,
de forma simples**: o dono é iniciante e usa IA para evoluir o app. Tudo tem que funcionar **no celular**.

## Onde está cada coisa
- Código: esta pasta (`finance-os`). Arquitetura e regras de negócio: `docs/ARQUITETURA.md`.
- Banco: Supabase, projeto `finance-os` (ref `nlyrceqahejizlnmppvz`, região São Paulo). Passo a passo: `docs/SUPABASE.md`.
- Site publicado (Vercel): https://finance-os-amber-nine.vercel.app (projeto Vercel `finance-os`, já vinculado em `.vercel/`).
- Chaves públicas em `.env.local` (só URL + publishable key). **Nunca** use/coloque a chave secret/service_role.

## Comandos
```bash
npm install            # instala dependências (node_modules não vai junto em cópias)
npm run dev            # http://localhost:3000
npm run check          # lint + typecheck + testes (rode antes de publicar)
npm run build          # build de produção
```
Publicar (Vercel CLI já logado nesta máquina):
```bash
npx vercel deploy --prod --yes -b NEXT_PUBLIC_SUPABASE_URL=https://nlyrceqahejizlnmppvz.supabase.co -b NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key do .env.local> -e NEXT_PUBLIC_SUPABASE_URL=https://nlyrceqahejizlnmppvz.supabase.co -e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<mesma chave>
```

## Banco de dados (migrações)
- Ficam em `supabase/migrations/`, numeradas. **Já aplicadas no Supabase: 0001 a 0007.**
- Não há Supabase CLI/Docker: migração nova é colada no **SQL Editor** do painel e rodada.
  **Aplique a migração ANTES de publicar** o código que depende dela (senão a página quebra).
- O painel do Supabase está com "Automatically expose new tables" **desligado**: tabela nova precisa de
  `grant ... to authenticated`, `revoke ... from anon` e `enable row level security` + políticas.
- Testes de banco rodam em Postgres real via PGlite (`supabase/tests/*.test.ts`), sem Docker.

## Regras que não podem ser quebradas
- Dinheiro sempre em **centavos inteiros** (`*_cents`, `bigint`). Nada de float em valores.
- Isolamento entre pessoas é feito pelo **RLS no banco**, nunca só por filtro na tela.
- Operações com várias linhas (parcelas, pagamento de fatura, divisão) são **funções SQL atômicas e idempotentes**.
- Datas financeiras são `date` (AAAA-MM-DD) no fuso America/Sao_Paulo; exibir como DD/MM/AAAA.
- Sem dados inventados: sem dado, mostrar "—" ou estado vazio.

## Armadilhas do Next.js 16 deste projeto (já custaram bugs)
- `cacheComponents` está ligado. Em páginas/servidor, chame `getViewContext()` (ou algo que use
  `cookies()`/`connection()`) **antes** de ler a data (`todayISO()`/`new Date()`), senão o build falha
  com "encountered the unstable value new Date()".
- Quem lê sessão/cookies fica dentro de `<Suspense>`; o middleware chama-se `src/proxy.ts`.
- Componentes do shadcn instalados pela CLI às vezes vêm com `import { cn } from "cn"` — troque por `@/lib/utils`.
- Formulários com react-hook-form: use `useWatch`, não `watch` (o lint do React Compiler reclama).

## Visual
- Tema escuro fixo, tokens em `src/app/globals.css` (surface-1/2/3, positive, negative, warning, info).
- Componentes: shadcn/ui (Radix) + Magic UI (NumberTicker → `MoneyTicker`, BlurFade, BorderBeam, MagicCard)
  com animações sutis e respeitando "reduzir movimento".
- Cores dos gráficos validadas para daltonismo: receitas `#4a8ae0`, despesas `#e0535f`.

## Situação atual e ideias pendentes
- Fases 1–7 concluídas + extras: rendimento por % do CDI (CDI do Banco Central), painel "Pode gastar",
  atalhos rápidos, "O mês em uma conta", desfazer pagamento de fatura, aviso de visão filtrada.
- Ainda não testado com as duas contas ao mesmo tempo: convite do espaço e divisão de despesas.
- Ideias: tela "Esqueci minha senha", CSP (cabeçalho de segurança), leitura de nota fiscal com IA.
