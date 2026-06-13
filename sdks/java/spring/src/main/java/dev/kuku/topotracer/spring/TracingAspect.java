package dev.kuku.topotracer.spring;

import dev.kuku.topotracer.sdk.Span;
import dev.kuku.topotracer.sdk.TraceContext;
import dev.kuku.topotracer.sdk.TraceOptions;
import dev.kuku.topotracer.sdk.Tracer;
import dev.kuku.topotracer.sdk.TopoImportance;
import dev.kuku.topotracer.sdk.TopoNodeType;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;

/**
 * Aspect to automatically wrap method executions annotated with @Traced in a Span.
 */
@Aspect
public class TracingAspect {
    private final Tracer tracer;

    public TracingAspect(Tracer tracer) {
        this.tracer = tracer;
    }

    @Around("@annotation(traced)")
    public Object traceMethod(ProceedingJoinPoint joinPoint, Traced traced) throws Throwable {
        String spanName = traced.value();
        if (spanName.isEmpty()) {
            MethodSignature signature = (MethodSignature) joinPoint.getSignature();
            spanName = signature.getDeclaringType().getSimpleName() + "." + signature.getMethod().getName();
        }

        // Determine node type from String or Enum
        String nodeType = traced.nodeType();
        if (nodeType.isEmpty()) {
            nodeType = traced.type().getValue();
        }

        TraceOptions options = TraceOptions.builder()
            .nodeType(nodeType)
            .dynamicImportance(traced.dynamicImportance());

        // Determine importance from integer, enum, or dynamic config
        if (traced.importanceLevel() != -1) {
            options.importanceLevel(traced.importanceLevel());
        } else if (traced.importance() != TopoImportance.DYNAMIC) {
            options.importance(traced.importance());
        }

        Span span = tracer.startNode(spanName, options);
        Span parent = TraceContext.getActive();
        TraceContext.setActive(span);

        try {
            return joinPoint.proceed();
        } catch (Throwable t) {
            span.setAttribute("error", true);
            span.setAttribute("error.message", t.getMessage());
            throw t;
        } finally {
            span.end();
            TraceContext.setActive(parent);
        }
    }
}
