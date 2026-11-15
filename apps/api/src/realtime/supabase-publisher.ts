/** Server-side publisher for Supabase Realtime private Broadcast channels. */
export class SupabaseRealtimePublisher {
  private readonly endpoint: string;

  constructor(private readonly config: { url: string; serviceRoleKey: string }) {
    const base = new URL(config.url);
    if (base.protocol !== 'https:' && base.hostname !== 'localhost' && base.hostname !== '127.0.0.1') {
      throw new Error('Supabase Realtime requires HTTPS outside localhost');
    }
    if (!config.serviceRoleKey.trim()) throw new Error('Supabase server key is required');
    this.endpoint = `${base.origin}/realtime/v1/api/broadcast`;
  }

  async broadcast(topic: string, event: string, payload: unknown): Promise<void> {
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          apikey: this.config.serviceRoleKey,
          authorization: `Bearer ${this.config.serviceRoleKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ topic, event, payload, private: true }],
        }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) {
        // Do not log response bodies: provider errors can contain operational details.
        console.error(`Supabase Realtime broadcast failed (${response.status})`);
      }
    } catch (error) {
      console.error('Supabase Realtime broadcast failed', error instanceof Error ? error.message : 'unknown error');
    }
  }
}
