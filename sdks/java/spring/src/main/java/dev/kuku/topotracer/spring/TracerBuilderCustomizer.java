package dev.kuku.topotracer.spring;

import dev.kuku.topotracer.sdk.Tracer;

/**
 * Callback interface that can be used to customize a {@link dev.kuku.topotracer.sdk.Tracer.Builder}
 * before it is used to build the auto-configured {@link Tracer}.
 */
@FunctionalInterface
public interface TracerBuilderCustomizer {
    /**
     * Customize the given {@link dev.kuku.topotracer.sdk.Tracer.Builder}.
     *
     * @param builder the builder to customize
     */
    void customize(Tracer.Builder builder);
}
