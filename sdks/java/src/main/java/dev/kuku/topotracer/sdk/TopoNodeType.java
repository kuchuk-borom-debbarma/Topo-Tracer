package dev.kuku.topotracer.sdk;

/**
 * Standard node types supported by Topo-Tracer.
 */
public enum TopoNodeType {
    CONTROLLER("controller"),
    DB_CALL("db-call"),
    REMOTE_CALL("remote-call"),
    IO("io"),
    METHOD("method");

    private final String value;

    TopoNodeType(String value) {
        this.value = value;
    }

    public String getValue() {
        return value;
    }
}
