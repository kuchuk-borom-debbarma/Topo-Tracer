package dev.kuku.topotracer.sdk;

/**
 * Standard importance levels supported by Topo-Tracer.
 */
public enum TopoImportance {
    CRITICAL(0),
    HIGH(1),
    MEDIUM(2),
    LOW(3),
    DYNAMIC(-1);

    private final int level;

    TopoImportance(int level) {
        this.level = level;
    }

    public int getLevel() {
        return level;
    }
}
