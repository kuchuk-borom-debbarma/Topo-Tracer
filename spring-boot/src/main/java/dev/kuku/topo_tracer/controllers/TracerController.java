package dev.kuku.topo_tracer.controllers;

import dev.kuku.topo_tracer.services.tracer.TraceDTOs.TraceEvent;
import dev.kuku.topo_tracer.services.tracer.TracerService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/tracer")
public class TracerController {

    private final TracerService tracerService;

    public TracerController(TracerService tracerService) {
        this.tracerService = tracerService;
    }

    @PostMapping("/ingest")
    public ResponseEntity<Void> ingest(
        @RequestHeader("X-User-Id") String userId,
        @RequestBody TraceEvent event
    ) {
        tracerService.ingestTraceEvent(userId, event);
        return ResponseEntity.ok().build();
    }
}
