package dev.kuku.topotracer.spring;

import dev.kuku.topotracer.sdk.Tracer;
import dev.kuku.topotracer.sdk.LogHook;
import dev.kuku.topotracer.sdk.TraceHook;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.BeansException;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * Spring Boot auto-configuration for Topo-Tracer.
 */
@Configuration
@EnableConfigurationProperties(TopoTracerProperties.class)
@ConditionalOnProperty(prefix = "topotracer", name = {"endpoint", "apiKey"})
public class TopoTracerAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public Tracer topoTracer(TopoTracerProperties properties,
                              ObjectProvider<LogHook> logHooksProvider,
                              ObjectProvider<TraceHook> traceHooksProvider) {
        Tracer.Builder builder = new Tracer.Builder()
            .endpoint(properties.getEndpoint())
            .apiKey(properties.getApiKey())
            .userId(properties.getUserId())
            .serviceName(properties.getServiceName())
            .batchSize(properties.getBatchSize())
            .flushIntervalMs(properties.getFlushIntervalMs())
            .maxRetries(properties.getMaxRetries())
            .retryDelayMs(properties.getRetryDelayMs())
            .nodeTypeImportanceMapping(properties.getNodeTypeImportanceMapping())
            .ignoreFailures(properties.isIgnoreFailures())
            .importanceLabels(properties.getImportanceLabels());

        logHooksProvider.orderedStream().forEach(builder::addLogHook);
        traceHooksProvider.orderedStream().forEach(builder::addTraceHook);

        return builder.build();
    }

    @Bean
    @ConditionalOnMissingBean
    public TracingAspect tracingAspect(Tracer tracer) {
        return new TracingAspect(tracer);
    }

    @Bean
    @ConditionalOnMissingBean
    public FilterRegistrationBean<TracingFilter> tracingFilterRegistration(Tracer tracer, TopoTracerProperties properties) {
        FilterRegistrationBean<TracingFilter> registration = new FilterRegistrationBean<>();
        registration.setFilter(new TracingFilter(tracer, properties));
        registration.addUrlPatterns("/*");
        registration.setName("topoTracerFilter");
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE);
        return registration;
    }

    @Bean
    @ConditionalOnMissingBean
    public TracingClientHttpRequestInterceptor tracingClientHttpRequestInterceptor(Tracer tracer) {
        return new TracingClientHttpRequestInterceptor(tracer);
    }

    @Bean
    @ConditionalOnMissingBean
    public TracingTaskDecorator tracingTaskDecorator() {
        return new TracingTaskDecorator();
    }

    /**
     * Post-processor to automatically apply the task decorator on all thread pool executors
     * registered in Spring, enabling context propagation across @Async calls.
     */
    @Bean
    public static BeanPostProcessor tracingTaskExecutorPostProcessor() {
        return new BeanPostProcessor() {
            @Override
            public Object postProcessAfterInitialization(Object bean, String beanName) throws BeansException {
                if (bean instanceof ThreadPoolTaskExecutor) {
                    ThreadPoolTaskExecutor executor = (ThreadPoolTaskExecutor) bean;
                    executor.setTaskDecorator(new TracingTaskDecorator());
                }
                return bean;
            }
        };
    }
}
