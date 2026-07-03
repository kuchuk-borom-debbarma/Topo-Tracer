package dev.kuku.topotracer.sdk;

import dev.kuku.topotracer.sdk.models.GroupLayer;

import java.util.HashMap;
import java.util.Map;

/**
 * Options configuration builder for starting new traces or nested spans.
 */
public class TraceOptions {
    private String traceName;
    private final Map<Integer, String> importanceLabels = new HashMap<>();
    private Integer importanceLevel;
    private boolean dynamicImportance = false;
    private String traceId;
    private String parentSpanId;
    private String groupParentId;
    private boolean groupParentExplicit = false;
    private GroupLayer layer;
    private String nodeType;
    private String name;
    private final Map<String, String> data = new HashMap<>();

    public static TraceOptions builder() {
        return new TraceOptions();
    }

    public TraceOptions traceName(String traceName) {
        this.traceName = traceName;
        return this;
    }

    public TraceOptions importanceLabels(Map<Integer, String> importanceLabels) {
        if (importanceLabels != null) {
            this.importanceLabels.putAll(importanceLabels);
        }
        return this;
    }

    public TraceOptions importanceLabel(int level, String label) {
        this.importanceLabels.put(level, label);
        return this;
    }

    public TraceOptions importanceLevel(Integer importanceLevel) {
        this.importanceLevel = importanceLevel;
        return this;
    }

    public TraceOptions importance(Importance importance) {
        if (importance != null) {
            if (importance.getLevel() == -1) {
                this.dynamicImportance = true;
                this.importanceLevel = null;
            } else {
                this.importanceLevel = importance.getLevel();
                this.dynamicImportance = false;
            }
            if (importance.getLabel() != null) {
                this.importanceLabels.put(importance.getLevel(), importance.getLabel());
            }
        }
        return this;
    }

    @Deprecated
    public TraceOptions importance(TopoImportance importance) {
        if (importance != null) {
            if (importance == TopoImportance.DYNAMIC) {
                return importance(DefaultImportance.DYNAMIC);
            } else if (importance == TopoImportance.CRITICAL) {
                return importance(DefaultImportance.CRITICAL);
            } else if (importance == TopoImportance.HIGH) {
                return importance(DefaultImportance.HIGH);
            } else if (importance == TopoImportance.MEDIUM) {
                return importance(DefaultImportance.MEDIUM);
            } else if (importance == TopoImportance.LOW) {
                return importance(DefaultImportance.LOW);
            }
        }
        return this;
    }

    public TraceOptions dynamicImportance(boolean dynamicImportance) {
        this.dynamicImportance = dynamicImportance;
        return this;
    }

    public TraceOptions traceId(String traceId) {
        this.traceId = traceId;
        return this;
    }

    public TraceOptions parentSpanId(String parentSpanId) {
        this.parentSpanId = parentSpanId;
        return this;
    }

    public TraceOptions groupParentId(String groupParentId) {
        this.groupParentId = groupParentId;
        this.groupParentExplicit = true;
        return this;
    }

    public TraceOptions layer(String key, int order) {
        return layer(key, key, order);
    }

    public TraceOptions layer(String key, String label, int order) {
        this.layer = key == null || key.isBlank()
            ? null
            : new GroupLayer(key, label == null || label.isBlank() ? key : label, order);
        return this;
    }

    public TraceOptions nodeType(String nodeType) {
        this.nodeType = nodeType;
        return this;
    }

    public TraceOptions nodeType(TopoNodeType nodeType) {
        if (nodeType != null) {
            this.nodeType = nodeType.getValue();
        }
        return this;
    }

    public TraceOptions data(Map<String, String> data) {
        if (data != null) {
            this.data.putAll(data);
        }
        return this;
    }

    public TraceOptions attribute(String key, String value) {
        this.data.put(key, value);
        return this;
    }

    public TraceOptions name(String name) {
        this.name = name;
        return this;
    }

    public String getTraceName() {
        return traceName;
    }

    public Map<Integer, String> getImportanceLabels() {
        return importanceLabels;
    }

    public Integer getImportanceLevel() {
        return importanceLevel;
    }

    public boolean isDynamicImportance() {
        return dynamicImportance;
    }

    public String getTraceId() {
        return traceId;
    }

    public String getParentSpanId() {
        return parentSpanId;
    }

    public String getGroupParentId() {
        return groupParentId;
    }

    public boolean isGroupParentExplicit() {
        return groupParentExplicit;
    }

    public GroupLayer getLayer() {
        return layer;
    }

    public String getNodeType() {
        return nodeType;
    }

    public String getName() {
        return name;
    }

    public Map<String, String> getData() {
        return data;
    }
}
