package dev.kuku.topotracer.spring;

import dev.kuku.topotracer.sdk.Span;
import dev.kuku.topotracer.sdk.TraceContext;
import org.springframework.core.task.TaskDecorator;

/**
 * Task decorator to automatically copy ThreadLocal trace contexts to Spring-managed asynchronous tasks.
 */
public class TracingTaskDecorator implements TaskDecorator {

    @Override
    public Runnable decorate(Runnable runnable) {
        Span activeSpan = TraceContext.getActive();
        return () -> {
            Span parent = TraceContext.getActive();
            TraceContext.setActive(activeSpan);
            try {
                runnable.run();
            } finally {
                TraceContext.setActive(parent);
            }
        };
    }
}
