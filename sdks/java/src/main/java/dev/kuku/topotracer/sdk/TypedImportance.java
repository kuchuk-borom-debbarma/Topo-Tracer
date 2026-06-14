package dev.kuku.topotracer.sdk;

/**
 * Generic typed base class for custom user-defined enum importance levels.
 * Allows type safety and auto-complete for custom importance mappings.
 *
 * @param <E> the enum type representing the custom scale
 */
public abstract class TypedImportance<E extends Enum<E>> extends Importance {
    private final E value;

    protected TypedImportance(E value, int level, String label) {
        super(level, label);
        this.value = value;
    }

    public E getValue() {
        return value;
    }
}
