package dev.kuku.topo_tracer.infra.event_bus;

import org.springframework.stereotype.Service;

/**
 * Should also handle durability
 * EventBus
 */
@Service
public interface EventBus {
    void publish(String topic, Object data, Object metadata);
}
