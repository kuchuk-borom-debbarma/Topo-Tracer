package dev.kuku.topo_tracer.services.tracer;

import org.springframework.stereotype.Service;
import dev.kuku.topo_tracer.services.tracer.repositories.TracerRepo;

@Service
public class TracerService {
    private final TracerRepo tracerRepo;

    public TracerService(TracerRepo tracerRepo) {
        this.tracerRepo = tracerRepo;
    }

    public void ingestTraceEvent(
        String userId,
        TraceDTOs.TraceEvent event
    ) {
        tracerRepo.ingest(userId, event);
    }
}
