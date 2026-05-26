export interface MessageEnvelope {
  topic: string;
  payload: any;
  key?: string; // Optional partition key (e.g. for Kafka)
  options?: any; // Message-specific metadata or options
}

export interface SubscribeOptions {
  batchSize?: number; // Target number of events to process in a single handler tick
  [key: string]: any; // Additional backend-specific parameters
}

export abstract class MessageBroker {
  // Publishes a single message envelope or a batch of envelopes to the broker
  abstract publish(
    envelopes: MessageEnvelope | MessageEnvelope[], 
    options?: any
  ): Promise<void>;

  // Subscribes to a topic, delivering events in batches to the handler
  abstract subscribe(
    topic: string,
    handler: (payloads: any[], options?: any) => Promise<void> | void,
    options?: SubscribeOptions
  ): Promise<void>;
}
