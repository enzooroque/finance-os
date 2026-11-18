/**
 * Traduz erros do banco em mensagens para o usuário.
 * Só repassa as mensagens que NÓS escrevemos nas funções SQL (em português, códigos conhecidos).
 * Mensagens técnicas do Postgres (em inglês, citando tabelas/colunas) viram texto genérico.
 */
const KNOWN_CODES = new Set(["22023", "23505", "23514", "42501"]);
const TECHNICAL = /violates|duplicate key|permission denied|does not exist|null value|invalid input|relation|column|syntax/i;
const GENERIC = "Não foi possível concluir agora. Tente novamente.";

type DbError = { code?: string; message?: string } | null | undefined;

export function dbErrorMessage(error: DbError, overrides: Partial<Record<string, string>> = {}): string {
  if (error?.code && overrides[error.code]) return overrides[error.code]!;
  if (error?.code && KNOWN_CODES.has(error.code) && error.message && !TECHNICAL.test(error.message)) {
    return error.message;
  }
  return GENERIC;
}

/** Conflito na chave de idempotência = o mesmo envio já foi salvo (duplo clique/reenvio). */
export function isIdempotencyConflict(error: DbError) {
  return error?.code === "23505" && /idempotency_key/.test(error.message ?? "");
}
