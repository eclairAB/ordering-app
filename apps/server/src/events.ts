import { EventEmitter } from 'node:events';
import type { Order } from '@ordering/shared';

export interface OrderBus {
  publish(order: Order): void;
  /** Returns an unsubscribe function. */
  subscribe(listener: (order: Order) => void): () => void;
}

/** In-process fan-out of order changes to SSE connections. */
export function createOrderBus(): OrderBus {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);
  return {
    publish: (order) => emitter.emit('order', order),
    subscribe(listener) {
      emitter.on('order', listener);
      return () => emitter.off('order', listener);
    },
  };
}
