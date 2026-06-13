package dev.kuku.topotracer.spring;

import dev.kuku.topotracer.sdk.Span;
import dev.kuku.topotracer.sdk.TraceContext;
import dev.kuku.topotracer.sdk.TraceOptions;
import dev.kuku.topotracer.sdk.Tracer;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Servlet Filter to automatically trace incoming HTTP requests.
 * Extracts propagation headers (X-Trace-Id, X-Span-Id) if present.
 */
public class TracingFilter extends OncePerRequestFilter {
    private final Tracer tracer;

    public TracingFilter(Tracer tracer) {
        this.tracer = tracer;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        // Extract trace details from request headers
        String traceId = request.getHeader("x-topo-trace-id");
        if (traceId == null || traceId.isBlank()) {
            traceId = request.getHeader("X-Trace-Id");
        }

        String spanId = request.getHeader("x-topo-parent-id");
        if (spanId == null || spanId.isBlank()) {
            spanId = request.getHeader("X-Span-Id");
        }

        TraceOptions options = TraceOptions.builder()
            .nodeType("http-request")
            .attribute("http.method", request.getMethod())
            .attribute("http.url", request.getRequestURI());

        if (traceId != null && !traceId.isBlank() && spanId != null && !spanId.isBlank()) {
            options.traceId(traceId).parentSpanId(spanId);
        }

        String spanName = "HTTP " + request.getMethod() + " " + request.getRequestURI();
        Span span = tracer.startNode(spanName, options);

        Span previousSpan = TraceContext.getActive();
        TraceContext.setActive(span);

        try {
            filterChain.doFilter(request, response);
            span.setAttribute("http.status_code", response.getStatus());
        } catch (Exception e) {
            span.setAttribute("error", true);
            span.setAttribute("error.message", e.getMessage());
            throw e;
        } finally {
            span.end();
            TraceContext.setActive(previousSpan);
        }
    }
}
