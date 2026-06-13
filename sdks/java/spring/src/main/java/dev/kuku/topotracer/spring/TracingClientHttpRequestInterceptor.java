package dev.kuku.topotracer.spring;

import dev.kuku.topotracer.sdk.Span;
import dev.kuku.topotracer.sdk.TraceContext;
import dev.kuku.topotracer.sdk.TraceOptions;
import dev.kuku.topotracer.sdk.Tracer;
import org.springframework.http.HttpRequest;
import org.springframework.http.client.ClientHttpRequestExecution;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.http.client.ClientHttpResponse;

import java.io.IOException;

/**
 * Interceptor to trace outbound HTTP requests and inject propagation headers.
 */
public class TracingClientHttpRequestInterceptor implements ClientHttpRequestInterceptor {
    private final Tracer tracer;

    public TracingClientHttpRequestInterceptor(Tracer tracer) {
        this.tracer = tracer;
    }

    @Override
    public ClientHttpResponse intercept(HttpRequest request, byte[] body, ClientHttpRequestExecution execution)
            throws IOException {
        String spanName = "HTTP CLIENT " + request.getMethod() + " " + request.getURI();
        TraceOptions options = TraceOptions.builder()
            .nodeType("remote-call")
            .attribute("http.method", request.getMethod().name())
            .attribute("http.url", request.getURI().toString());

        Span clientSpan = tracer.startNode(spanName, options);
        Span parent = TraceContext.getActive();
        TraceContext.setActive(clientSpan);

        try {
            request.getHeaders().add("x-topo-trace-id", clientSpan.getTraceId());
            request.getHeaders().add("x-topo-parent-id", clientSpan.getId());
            request.getHeaders().add("X-Trace-Id", clientSpan.getTraceId());
            request.getHeaders().add("X-Span-Id", clientSpan.getId());

            ClientHttpResponse response = execution.execute(request, body);
            clientSpan.setAttribute("http.status_code", String.valueOf(response.getStatusCode().value()));
            return response;
        } catch (IOException e) {
            clientSpan.setAttribute("error", "true");
            clientSpan.setAttribute("error.message", e.getMessage());
            throw e;
        } finally {
            clientSpan.end();
            TraceContext.setActive(parent);
        }
    }
}
