# Finance OS

Aplicativo web de finanças pessoais para um casal: dados pessoais + um espaço compartilhado,
com visões **Pessoal**, **Compartilhado** e **Consolidado**. Em português, reais (BRL) e
horário de Brasília. Funciona no computador e no celular (instalável como app).

**No ar:** https://finance-os-amber-nine.vercel.app

## O que ele faz

- **Contas** com saldo, extrato, conciliação e **rendimento diário** (% do CDI, com o CDI oficial do Banco Central).
- **Lançamentos** de receitas e despesas, transferências e divisão de gastos entre o casal.
- **Cartões de crédito** com fatura, compras parceladas e pagamento parcial.
- **Contas fixas** (recorrentes), **orçamentos** por categoria e **metas** de economia.
- **Dashboard** com "Pode gastar" (ritmo do mês), "O mês em uma conta", gráficos e alertas.
- **Relatórios** com exportação para planilha (CSV).
- **Espaço compartilhado** com convite: cada pessoa vê o que é dela e o que é do casal.

## Como foi feito

Este projeto foi **vibecodado**: eu não escrevi o código linha por linha. Construí o app conversando
com uma IA, que escreveu o código seguindo as minhas decisões.

O que foi meu:

- **A ideia e o produto:** o que o app precisa resolver na vida real do casal, quais telas existem e como cada uma deve se comportar.
- **O plano:** dividi o trabalho em 7 fases (base, login e banco, finanças, cartões, planejamento, painel e relatórios, testes e publicação) e aprovei cada uma antes de seguir.
- **As decisões:** rendimento por % do CDI, visão compartilhada, uso no celular, visual escuro, o que entrava e o que ficava de fora.
- **Os testes de verdade:** usei o app no dia a dia, no computador e no celular, achei os problemas e pedi as correções.
- **A infraestrutura:** banco no Supabase e site na Vercel, nas minhas contas.

O que a IA fez: escreveu o código, os testes automáticos e a documentação, sempre revisada por mim no uso.

## Tecnologia

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui · Magic UI · Recharts ·
Supabase (Postgres + Auth + RLS) · Vercel · Vitest + PGlite (testes do banco).

## Como rodar no seu computador

Pré-requisito: Node.js 20.9 ou mais novo. Configure o Supabase seguindo
[docs/SUPABASE.md](docs/SUPABASE.md) e copie `.env.example` para `.env.local`.

```bash
npm install
npm run dev
```

Abra http://localhost:3000.

| Comando | O que faz |
|---|---|
| `npm run dev` | Abre o app em modo desenvolvimento |
| `npm run check` | Lint + typecheck + testes de uma vez |
| `npm test` | Testes (dinheiro, datas, rendimento, regras de segurança do banco) |
| `npm run build` | Gera a versão de produção |

Arquitetura e regras de negócio: [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

## Segurança (resumo)

- Cada pessoa só vê os próprios dados e os do espaço compartilhado: isso é garantido pelo banco
  (RLS), e há testes automáticos que provam esse isolamento.
- Valores sempre em centavos inteiros; nunca número com vírgula flutuante.
- Nunca guardamos número completo de cartão, CVV ou senha.
- O app instalável (PWA) não guarda dados financeiros em cache.
