export interface Plugin {
  reads: string[]
  writes: string
  read(text: string): Record<string, string>[]
  write(rows: Record<string, string>[]): string
}
