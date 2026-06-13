package dev.kuku.topotracer.spring;

import dev.kuku.topotracer.sdk.Span;
import dev.kuku.topotracer.sdk.TraceContext;
import org.springframework.http.HttpRequest;
import org.springframework.http.client.ClientHttpRequestExecution;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.http.client.ClientHttpResponse;

import java.io.IOException;

/**
 * Interceptor to inject tracing context headers (X-Trace-Id, X-Span-Id) into outgoing REST requests.
 */
public class TracingClientHttpRequestInterceptor implements ClientHttpRequestInterceptor {

    @Override
    public ClientHttpResponse intercept(HttpRequest request, byte[] body, ClientHttpRequestExecution execution)
            throws IOException {
        Span activeSpan = TraceContext.getActive();
        if (activeSpan != null) {
            request.getHeaders().add("x-topo-trace-id", activeSpan.getTraceId());
            request.getHeaders().add("x-topo-parent-id", activeSpan.getId());
            request.getHeaders().add("X-Trace-Id", activeSpan.getTraceId());
            request.getHeaders().add("X-Span-Id", activeSpan.getId());
        }
        return execution.execute(request, body);
    }
}
