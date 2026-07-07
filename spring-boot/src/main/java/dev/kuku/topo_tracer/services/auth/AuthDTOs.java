package dev.kuku.topo_tracer.services.auth;

public class AuthDTOs {

    public record User(
        String userId,
        String username,
        long createdAt,
        long updatedAt
    ) {}
}
