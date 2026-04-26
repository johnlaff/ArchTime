import type { HistoryBundle } from '@/lib/history'

export class HistoryAuthError extends Error {
  constructor() {
    super('Unauthorized')
    this.name = 'HistoryAuthError'
  }
}

export async function parseHistoryBundleResponse(response: Response): Promise<HistoryBundle> {
  if (response.status === 401 || response.status === 403) {
    throw new HistoryAuthError()
  }
  if (!response.ok) {
    throw new Error('Erro ao carregar histórico')
  }
  return response.json() as Promise<HistoryBundle>
}
