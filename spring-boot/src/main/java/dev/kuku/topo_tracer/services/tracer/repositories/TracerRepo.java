package dev.kuku.topo_tracer.services.tracer.repositories;

import dev.kuku.topo_tracer.services.tracer.TraceDTOs.TraceEvent;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class TracerRepo {
    private final JdbcTemplate jdbcTemplate;

    public TracerRepo(@Qualifier("clickhouseJdbcTemplate") JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void ingest(String userId, TraceEvent event) {
        // TODO: Implement ClickHouse insertion
    }
}
