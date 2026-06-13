package dev.kuku.topotracer.spring;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.HashMap;
import java.util.Map;

@ConfigurationProperties(prefix = "topotracer")
public class TopoTracerProperties {
    private String endpoint;
    private String apiKey;
    private String userId;
    private String serviceName;
    private int batchSize = 100;
    private int flushIntervalMs = 5000;
    private int maxRetries = 5;
    private int retryDelayMs = 1000;
    private String defaultTraceName;
    private Map<Integer, String> importanceLabels = new HashMap<>();

    public String getEndpoint() {
        return endpoint;
    }

    public void setEndpoint(String endpoint) {
        this.endpoint = endpoint;
    }

    public String getApiKey() {
        return apiKey;
    }

    public void setApiKey(String apiKey) {
        this.apiKey = apiKey;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getServiceName() {
        return serviceName;
    }

    public void setServiceName(String serviceName) {
        this.serviceName = serviceName;
    }

    public int getBatchSize() {
        return batchSize;
    }

    public void setBatchSize(int batchSize) {
        this.batchSize = batchSize;
    }

    public int getFlushIntervalMs() {
        return flushIntervalMs;
    }

    public void setFlushIntervalMs(int flushIntervalMs) {
        this.flushIntervalMs = flushIntervalMs;
    }

    public int getMaxRetries() {
        return maxRetries;
    }

    public void setMaxRetries(int maxRetries) {
        this.maxRetries = maxRetries;
    }

    public int getRetryDelayMs() {
        return retryDelayMs;
    }

    public void setRetryDelayMs(int retryDelayMs) {
        this.retryDelayMs = retryDelayMs;
    }

    public String getDefaultTraceName() {
        return defaultTraceName;
    }

    public void setDefaultTraceName(String defaultTraceName) {
        this.defaultTraceName = defaultTraceName;
    }

    public Map<Integer, String> getImportanceLabels() {
        return importanceLabels;
    }

    public void setImportanceLabels(Map<Integer, String> importanceLabels) {
        this.importanceLabels = importanceLabels;
    }

    private Map<String, Integer> nodeTypeImportanceMapping = new HashMap<>();

    public Map<String, Integer> getNodeTypeImportanceMapping() {
        return nodeTypeImportanceMapping;
    }

    public void setNodeTypeImportanceMapping(Map<String, Integer> nodeTypeImportanceMapping) {
        this.nodeTypeImportanceMapping = nodeTypeImportanceMapping;
    }
}
