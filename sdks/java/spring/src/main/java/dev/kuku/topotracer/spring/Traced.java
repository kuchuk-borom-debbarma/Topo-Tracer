package dev.kuku.topotracer.spring;

import dev.kuku.topotracer.sdk.TopoNodeType;
import dev.kuku.topotracer.sdk.TopoImportance;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Annotation for method-level tracing.
 * Spans created via this annotation will automatically link to any active parent span.
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface Traced {
    /**
     * Custom name of the trace span. If empty, falls back to ClassName.MethodName.
     */
    String value() default "";

    /**
     * Type-safe Enum for standard Topo-Tracer node types.
     */
    TopoNodeType type() default TopoNodeType.METHOD;

    /**
     * Type-safe Enum for standard Topo-Tracer importance levels.
     */
    TopoImportance importance() default TopoImportance.DYNAMIC;

    /**
     * Custom node type string fallback. Takes precedence if provided.
     */
    String nodeType() default "";

    /**
     * Explicit importance level integer fallback. Takes precedence if not -1.
     */
    int importanceLevel() default -1;

    /**
     * If true, and this is a nested call, the importance level will automatically
     * scale to parentImportance + 1.
     */
    boolean dynamicImportance() default false;

    /**
     * Include bounded argument values in span data.
     * Disabled by default because arguments may contain sensitive data.
     */
    boolean includeArguments() default false;

    int maxArgumentLength() default 128;

    /**
     * Parameter names whose values are replaced with "[REDACTED]".
     */
    String[] redactArguments() default {};
}
