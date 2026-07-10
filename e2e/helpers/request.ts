/** Cabeçalho que faz mutações do APIRequestContext obedecerem ao CSRF da aplicação. */
export function sameOriginHeaders(baseURL: string | undefined): Record<string, string> {
  return { Origin: new URL(baseURL ?? 'http://localhost:3000').origin }
}
