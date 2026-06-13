package dev.kuku.topotracer.spring;

import dev.kuku.topotracer.sdk.Span;
import dev.kuku.topotracer.sdk.TraceContext;
import dev.kuku.topotracer.sdk.Tracer;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.List;

@SpringBootApplication
@EnableAsync
public class SpringExample implements CommandLineRunner {

    public static void main(String[] args) {
        SpringApplication.run(SpringExample.class, args);
    }

    @Autowired
    private OrderService orderService;

    @Autowired
    private RestTemplate restTemplate;

    @Override
    public void run(String... args) throws Exception {
        System.out.println("Running Spring Topo-Tracer Example...");
        
        // This will automatically start a trace and nesting
        orderService.processOrder("ord_123", 99.99);

        // Make an outgoing request (will carry headers automatically due to the interceptor)
        try {
            orderService.triggerOutgoingCall();
        } catch (Exception e) {
            // Ignore actual network failure in mock example
        }
    }

    @Bean
    public RestTemplate restTemplate(TracingClientHttpRequestInterceptor interceptor) {
        RestTemplate restTemplate = new RestTemplate();
        List<ClientHttpRequestInterceptor> interceptors = new ArrayList<>(restTemplate.getInterceptors());
        interceptors.add(interceptor);
        restTemplate.setInterceptors(interceptors);
        return restTemplate;
    }

    @Service
    public static class OrderService {

        @Autowired
        private Tracer tracer;

        @Autowired
        private RestTemplate restTemplate;

        // Auto-trace method with AOP, nesting is automatically established
        @Traced(value = "order-processing", nodeType = "service")
        public void processOrder(String orderId, double amount) {
            Span activeSpan = TraceContext.getActive();
            System.out.println("Active traceId: " + activeSpan.getTraceId() + ", spanId: " + activeSpan.getId());
            activeSpan.setAttribute("order.id", orderId);

            // Nested method call with dynamic nested importance level increment
            validateStock(orderId);

            // Async call: context will propagate automatically via TracingTaskDecorator
            triggerAsyncReportGeneration(orderId);
        }

        @Traced(value = "validate-stock", dynamicImportance = true)
        public void validateStock(String orderId) {
            Span activeSpan = TraceContext.getActive();
            System.out.println("Validating stock (dynamic importance: " + activeSpan.getImportanceLevel() + ")...");
        }

        @Async
        public void triggerAsyncReportGeneration(String orderId) {
            Span activeSpan = TraceContext.getActive();
            if (activeSpan != null) {
                System.out.println("Async thread active with traceId: " + activeSpan.getTraceId());
            } else {
                System.err.println("Context lost in async call!");
            }
        }

        @Traced("outgoing-call")
        public void triggerOutgoingCall() {
            // Outbound call automatically gets X-Trace-Id and X-Span-Id header injected
            restTemplate.getForObject("http://localhost:8080/api/v1/ping", String.class);
        }
    }
}
