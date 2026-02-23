export async function generateEntryHash(entry: {
  clockIn: string
  clockOut: string
  userId: string
  entryDate: string
}): Promise<string> {
  const data = JSON.stringify({
    clockIn: entry.clockIn,
    clockOut: entry.clockOut,
    userId: entry.userId,
    entryDate: entry.entryDate,
  })
  const encoder = new TextEncoder()
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data))
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}
