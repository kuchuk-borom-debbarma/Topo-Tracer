package dev.kuku.topotracer.spring;

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
     * Explicit importance level. If -1, inherits from parent or defaults to 1.
     */
    int importanceLevel() default -1;

    /**
     * If true, and this is a nested call, the importance level will automatically
     * scale to parentImportance + 1.
     */
    boolean dynamicImportance() default false;

    /**
     * Custom node type (e.g., "method", "db-query", "service").
     */
    String nodeType() default "method";
}
