package dev.kuku.topo_tracer.services.tracer;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

public class TraceDTOs {

    // =========================
    // Read model / processed model
    // =========================

    public record Trace(
        String fkUserId,
        String id,
        String name,
        long createdAt,
        long updatedAt
    ) {}

    public record Group(
        String fkUserId,
        String fkTraceId,
        String id,
        String name,

        /**
         * Developer-facing importance level for this group.
         *
         * Used by the renderer when placing groups visually.
         *
         * Suggested values:
         * 0 = core / top-level
         * 1 = important
         * 2 = normal
         * 3 = verbose
         * 4 = debug/noisy
         */
        int importanceLevel,

        long createdAt,
        long updatedAt
    ) {}

    public record Log(
        String fkUserId,
        String fkGroupId,
        String fkTraceId,
        String id,

        /**
         * Human-readable log message.
         */
        String message,

        /**
         * Optional severity.
         *
         * Example values:
         * debug, info, warn, error
         */
        String severity,

        /**
         * Developer-facing importance level.
         *
         * Used for two things:
         * 1. Visibility filtering in the UI.
         * 2. Visual nesting/placement when the group changes.
         *
         * Suggested values:
         * 0 = core / always visible
         * 1 = important
         * 2 = normal
         * 3 = verbose
         * 4 = debug/noisy
         */
        int importanceLevel,

        /**
         * When this log happened according to the source system.
         *
         * This is useful for sorting/debugging, but it is not the source
         * of truth for trace flow. The real flow is represented by
         * LogConnection rows.
         */
        long occurredAt,

        long createdAt,
        long updatedAt
    ) {}

    public record LogConnection(
        String id,

        /**
         * Trace this connection belongs to.
         */
        String fkTraceId,

        /**
         * Source log node.
         */
        String fkFromLogId,

        /**
         * Target log node.
         */
        String fkToLogId,

        /**
         * Optional connection type.
         *
         * Example values:
         * calls, emits, publishes, awaits, responds, retries, continues
         */
        String connectionType,

        long createdAt,
        long updatedAt,

        /**
         * When the connection/action was initiated.
         *
         * Example:
         * - request sent
         * - function call started
         * - external call started
         * - message published
         */
        long initiatedAt,

        /**
         * When the target side received/reached the action.
         *
         * Example:
         * - request reached external service
         * - child operation started
         * - message was consumed
         * - next log became active
         */
        long reachedAt,

        /**
         * When the target acknowledged/responded.
         *
         * Can be null if:
         * - no response was expected
         * - no response was captured
         * - the operation failed before acknowledgement
         * - the action is fire-and-forget
         */
        Long acknowledgedAt
    ) {}

    // =========================
    // Raw ingestion events
    // =========================

    @JsonTypeInfo(
        use = JsonTypeInfo.Id.NAME,
        include = JsonTypeInfo.As.PROPERTY,
        property = "eventType"
    )
    @JsonSubTypes({
        @JsonSubTypes.Type(value = TraceStartEvent.class, name = "TRACE_START"),
        @JsonSubTypes.Type(value = TraceEndEvent.class, name = "TRACE_END"),
        @JsonSubTypes.Type(value = GroupStartEvent.class, name = "GROUP_START"),
        @JsonSubTypes.Type(value = GroupEndEvent.class, name = "GROUP_END"),
        @JsonSubTypes.Type(value = LogEvent.class, name = "LOG"),
        @JsonSubTypes.Type(value = LogConnectionEvent.class, name = "LOG_CONNECTION")
    })
    public sealed interface TraceEvent
        permits
            TraceStartEvent,
            TraceEndEvent,
            GroupStartEvent,
            GroupEndEvent,
            LogEvent,
            LogConnectionEvent {
        String eventId();
        String traceId();
        long occurredAt();
        String eventType();
    }

    public record TraceStartEvent(
        String eventId,
        String traceId,
        String traceName,
        long occurredAt
    ) implements TraceEvent {
        @Override
        public String eventType() {
            return "TRACE_START";
        }
    }

    public record TraceEndEvent(
        String eventId,
        String traceId,
        long occurredAt
    ) implements TraceEvent {
        @Override
        public String eventType() {
            return "TRACE_END";
        }
    }

    public record GroupStartEvent(
        String eventId,
        String traceId,
        String groupId,
        String groupName,
        int importanceLevel,
        long occurredAt
    ) implements TraceEvent {
        @Override
        public String eventType() {
            return "GROUP_START";
        }
    }

    public record GroupEndEvent(
        String eventId,
        String traceId,
        String groupId,
        long occurredAt
    ) implements TraceEvent {
        @Override
        public String eventType() {
            return "GROUP_END";
        }
    }

    public record LogEvent(
        String eventId,
        String traceId,
        String logId,
        String groupId,
        String message,
        String severity,
        int importanceLevel,
        long occurredAt
    ) implements TraceEvent {
        @Override
        public String eventType() {
            return "LOG";
        }
    }

    public record LogConnectionEvent(
        String eventId,
        String traceId,
        String connectionId,
        String fromLogId,
        String toLogId,
        String connectionType,
        long initiatedAt,
        long reachedAt,
        Long acknowledgedAt
    ) implements TraceEvent {
        @Override
        public String eventType() {
            return "LOG_CONNECTION";
        }

        @Override
        public long occurredAt() {
            return initiatedAt;
        }
    }
}
