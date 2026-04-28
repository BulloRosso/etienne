export function emit(payload: unknown): void {
  process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
}

export function fail(message: string, extra: Record<string, unknown> = {}): never {
  process.stdout.write(JSON.stringify({ ok: false, error: message, ...extra }, null, 2) + "\n");
  process.exit(1);
}
