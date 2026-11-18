# Configurar o Supabase (passo a passo)

Leva uns 15 minutos. Você só precisa de um navegador; não é preciso instalar nada.

## 1. Criar o projeto
1. Acesse https://supabase.com e entre (pode usar a conta do GitHub).
2. Clique em **New project**.
3. Nome: `finance-os`. Em **Database Password**, clique em **Generate a password** e guarde essa
   senha num gerenciador de senhas (o app não usa, mas você pode precisar no futuro).
4. Região: **South America (São Paulo)**. Clique em **Create new project** e espere ficar pronto.

## 2. Criar as tabelas e as regras de segurança
1. No menu da esquerda, abra **SQL Editor** → **New query**.
2. No seu computador, abra o arquivo
   `supabase/migrations/20261115000001_initial_schema.sql`, copie **todo** o conteúdo,
   cole no editor e clique em **Run**. Deve aparecer "Success. No rows returned".
3. Faça o mesmo, um de cada vez, com:
   - `supabase/migrations/20261116000002_backfill_profiles.sql`
   - `supabase/migrations/20261116000003_core_finance.sql` (categorias padrão, saldos e lançamentos)
   - `supabase/migrations/20261116000004_cards.sql` (cartões, faturas, parcelas e pagamentos)
   - `supabase/migrations/20261116000005_planning.sql` (contas a pagar, metas e orçamentos)
   - `supabase/migrations/20261116000006_account_yield.sql` (taxa de rendimento da conta)
4. Confira: em **Table Editor** devem aparecer tabelas como `accounts`, `transactions`, `profiles`,
   todas com a etiqueta **RLS enabled**.

> Rode cada arquivo **uma vez só** e **nessa ordem** (pela data no nome). Se você já tinha rodado os
> primeiros numa fase anterior, rode só os novos. Se o primeiro der erro, me mande a mensagem.

## 3. Fechar o cadastro público
1. Menu **Authentication** → **Sign In / Providers**.
2. Desligue **Allow new users to sign up** e salve.
   Assim ninguém consegue criar conta sozinho; só você, pelo painel.
3. Em **Email**, deixe o provedor **ligado** (é o login com e-mail e senha).

## 4. Criar os dois usuários
1. **Authentication** → **Users** → **Add user** → **Create new user**.
2. Preencha o e-mail e uma senha forte (mínimo 8 caracteres) e marque **Auto Confirm User**.
3. Repita para a segunda pessoa.
4. Cada um pode trocar a própria senha depois em **Configurações** dentro do app.

## 5. Ligar o app ao Supabase
1. No Supabase: **Project Settings** (engrenagem) → **API Keys**. Copie a **Publishable key**
   (começa com `sb_publishable_`). Se só aparecer a chave **anon**, ela também serve.
2. Em **Project Settings** → **Data API**, copie a **Project URL** (`https://xxxx.supabase.co`).
3. Na pasta `finance-os`, copie o arquivo `.env.example` para um novo arquivo chamado `.env.local`
   e preencha:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
4. Pare o app (Ctrl+C no terminal) e rode `npm run dev` de novo.

> **Nunca** copie a chave **secret** / **service_role** para o app ou para o `.env.local`.
> Ela ignora todas as regras de segurança. O app não precisa dela.

## 6. Testar
1. Abra http://localhost:3000: deve aparecer a tela **Entrar**.
2. Entre com a primeira pessoa → **Configurações** → crie o **espaço compartilhado** →
   **Gerar convite** → copie o link.
3. Numa janela anônima, entre com a segunda pessoa e abra o link (ou cole o código em
   **Configurações**). Os dois devem aparecer como membros.

## Problemas comuns
| Sintoma | Causa provável |
|---|---|
| Tela "Banco de dados não configurado" | `.env.local` ausente, com nome errado, ou o app não foi reiniciado. |
| "E-mail ou senha incorretos" | Usuário não confirmado (marque **Auto Confirm User**) ou senha errada. |
| "Não foi possível conectar ao servidor" | URL do projeto errada ou sem internet. |
| Nome aparece como a parte do e-mail | Normal no primeiro acesso: ajuste em **Configurações → Perfil**. |
