package dev.kuku.topotracer.sdk;

/**
 * Represents an importance level with an integer value and optional label.
 * Serves as the base class for standard and custom typed importance definitions.
 */
public class Importance {
    private final int level;
    private final String label;

    public Importance(int level) {
        this(level, null);
    }

    public Importance(int level, String label) {
        this.level = level;
        this.label = label;
    }

    public int getLevel() {
        return level;
    }

    public String getLabel() {
        return label;
    }
}
