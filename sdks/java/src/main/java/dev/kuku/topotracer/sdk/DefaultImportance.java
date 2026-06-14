package dev.kuku.topotracer.sdk;

/**
 * Default implementation of importance levels mapping to standard TopoImportance.
 */
public class DefaultImportance extends TypedImportance<TopoImportance> {
    public static final DefaultImportance CRITICAL = new DefaultImportance(TopoImportance.CRITICAL, 0, "Critical");
    public static final DefaultImportance HIGH = new DefaultImportance(TopoImportance.HIGH, 1, "High");
    public static final DefaultImportance MEDIUM = new DefaultImportance(TopoImportance.MEDIUM, 2, "Medium");
    public static final DefaultImportance LOW = new DefaultImportance(TopoImportance.LOW, 3, "Low");
    public static final DefaultImportance DYNAMIC = new DefaultImportance(TopoImportance.DYNAMIC, -1, "Dynamic");

    private DefaultImportance(TopoImportance value, int level, String label) {
        super(value, level, label);
    }
}
