CREATE TABLE IF NOT EXISTS raw_trace_events (
    fk_user_id String,
    trace_id String,
    event_id String,
    event_type String,
    group_id String,
    group_name String,
    log_id String,
    message String,
    severity String,
    importance_level UInt8,
    occured_at Int64,
    ingested_at Int64,
    attributes_json_string String
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(toDateTime(ingested_at / 1000))
ORDER BY (trace_id, occured_at, event_id);
