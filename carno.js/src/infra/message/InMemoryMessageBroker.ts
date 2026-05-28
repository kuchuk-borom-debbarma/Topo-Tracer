import { Service } from "@carno.js/core";
import { MessageBroker } from "./MessageBroker";
import type { MessageEnvelope, SubscribeOptions } from "./MessageBroker";

@Service()
export class InMemoryMessageBroker extends MessageBroker {
  private queues = new Map<string, any[]>();
  private handlers = new Map<string, {
    handler: (payloads: any[], options?: any) => Promise<void> | void;
    options?: SubscribeOptions;
  }>();
  private scheduledFlushes = new Set<string>();

  override async publish(
    envelopes: MessageEnvelope | MessageEnvelope[], 
    options?: any
  ): Promise<void> {
    const list = Array.isArray(envelopes) ? envelopes : [envelopes];
    
    for (const env of list) {
      if (!this.queues.has(env.topic)) {
        this.queues.set(env.topic, []);
      }
      this.queues.get(env.topic)!.push(env.payload);
      this.scheduleFlush(env.topic);
    }
  }

  override async subscribe(
    topic: string,
    handler: (payloads: any[], options?: any) => Promise<void> | void,
    options?: SubscribeOptions
  ): Promise<void> {
    this.handlers.set(topic, { handler, options });
  }

  private scheduleFlush(topic: string) {
    if (this.scheduledFlushes.has(topic)) return;
    this.scheduledFlushes.add(topic);

    // Yield control asynchronously to simulate queue pipeline buffering
    setTimeout(async () => {
      this.scheduledFlushes.delete(topic);
      const queue = this.queues.get(topic) || [];
      if (queue.length === 0) return;

      const subscriber = this.handlers.get(topic);
      if (!subscriber) {
        return; // No subscriber registered yet, leave messages in queue
      }

      // Respect custom subscriber batch sizes (defaulting to 10 like AWS SQS)
      const batchSize = subscriber.options?.batchSize || 10;
      const batch = queue.splice(0, batchSize);
      
      try {
        await subscriber.handler(batch, subscriber.options);
      } catch (err) {
        console.error(`[InMemoryMessageBroker] Error in subscriber batch handler for topic "${topic}":`, err);
      }

      // If queue is not exhausted, schedule another chunk flush
      if (queue.length > 0) {
        this.scheduleFlush(topic);
      }
    }, 0);
  }
}
