import { io } from 'socket.io-client';

// websocket-only avoids long-polling problems behind Cloud Run's load balancer
export const socket = io({ transports: ['websocket'], autoConnect: true });

export function emitAck<T>(event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.timeout(8000).emit(event, payload, (err: Error | null, res: { ok: boolean; data?: T; error?: string }) => {
      if (err) return reject(new Error('Сервертэй холбогдож чадсангүй'));
      if (!res.ok) return reject(new Error(res.error));
      resolve(res.data as T);
    });
  });
}
