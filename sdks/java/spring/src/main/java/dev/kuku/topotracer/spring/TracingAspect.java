package dev.kuku.topotracer.spring;

import dev.kuku.topotracer.sdk.Span;
import dev.kuku.topotracer.sdk.TraceContext;
import dev.kuku.topotracer.sdk.TraceOptions;
import dev.kuku.topotracer.sdk.Tracer;
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

        TraceOptions options = TraceOptions.builder()
            .nodeType(traced.nodeType())
            .dynamicImportance(traced.dynamicImportance());

        if (traced.importanceLevel() != -1) {
            options.importanceLevel(traced.importanceLevel());
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
