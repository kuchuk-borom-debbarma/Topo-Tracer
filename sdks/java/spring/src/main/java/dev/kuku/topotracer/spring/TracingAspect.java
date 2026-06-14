package dev.kuku.topotracer.spring;

import dev.kuku.topotracer.sdk.Span;
import dev.kuku.topotracer.sdk.TraceContext;
import dev.kuku.topotracer.sdk.TraceOptions;
import dev.kuku.topotracer.sdk.Tracer;
import dev.kuku.topotracer.sdk.TopoImportance;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;

import java.lang.reflect.Method;
import java.util.Set;

/**
 * Aspect to automatically wrap method executions annotated with @Traced in a Span.
 * The node `name` is automatically derived as "ClassName.methodName(ParamType1, ParamType2)"
 * using AOP reflection — no user intervention required.
 */
@Aspect
public class TracingAspect {
    private final Tracer tracer;

    public TracingAspect(Tracer tracer) {
        this.tracer = tracer;
    }

    @Around("@annotation(traced)")
    public Object traceMethod(ProceedingJoinPoint joinPoint, Traced traced) throws Throwable {
        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        Method method = signature.getMethod();
        String className = signature.getDeclaringType().getSimpleName();
        String methodName = method.getName();

        // Auto-derive the startMessage (label): use annotation value if provided, else "ClassName.methodName"
        String spanName = traced.value();
        if (spanName.isEmpty()) {
            spanName = className + "." + methodName;
        }

        String autoName = className + "." + methodName;
        TraceArgumentFormatter.FormattedArguments formattedArguments = null;
        if (traced.includeArguments()) {
            formattedArguments = TraceArgumentFormatter.format(
                method,
                joinPoint.getArgs(),
                Set.of(traced.redactArguments()),
                traced.maxArgumentLength());
        }

        // Determine node type from String or Enum
        String nodeType = traced.nodeType();
        if (nodeType.isEmpty()) {
            nodeType = traced.type().getValue();
        }

        TraceOptions options = TraceOptions.builder()
            .nodeType(nodeType)
            .name(autoName)
            .dynamicImportance(traced.dynamicImportance());
        if (formattedArguments != null) {
            options.data(formattedArguments.attributes());
        }

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
