package dev.kuku.topotracer.spring;

import java.lang.reflect.Array;
import java.lang.reflect.Method;
import java.lang.reflect.Parameter;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * Formats method arguments for trace display without unbounded payload growth.
 */
public final class TraceArgumentFormatter {
    private TraceArgumentFormatter() {
    }

    public static FormattedArguments format(
            Method method,
            Object[] arguments,
            Set<String> redactedArguments,
            int maxArgumentLength) {
        int limit = Math.max(1, maxArgumentLength);
        Parameter[] parameters = method.getParameters();
        Map<String, String> attributes = new LinkedHashMap<>();

        for (int index = 0; index < parameters.length; index++) {
            String parameterName = parameters[index].isNamePresent()
                ? parameters[index].getName()
                : "arg" + index;
            String value = redactedArguments.contains(parameterName)
                ? "[REDACTED]"
                : truncate(render(arguments[index]), limit);

            attributes.put("argument." + parameterName, value);
        }

        return new FormattedArguments(attributes);
    }

    private static String render(Object value) {
        if (value == null) {
            return "null";
        }
        if (!value.getClass().isArray()) {
            return String.valueOf(value).replace('\n', ' ').replace('\r', ' ');
        }
        if (value instanceof Object[] objects) {
            return Arrays.deepToString(objects);
        }

        int length = Array.getLength(value);
        StringBuilder rendered = new StringBuilder("[");
        for (int index = 0; index < length; index++) {
            if (index > 0) {
                rendered.append(", ");
            }
            rendered.append(Array.get(value, index));
        }
        return rendered.append(']').toString();
    }

    private static String truncate(String value, int limit) {
        if (value.length() <= limit) {
            return value;
        }
        if (limit <= 3) {
            return value.substring(0, limit);
        }
        return value.substring(0, limit - 3) + "...";
    }

    public record FormattedArguments(Map<String, String> attributes) {
    }
}
