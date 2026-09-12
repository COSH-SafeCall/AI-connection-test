package com.safecall.service.token;

import java.time.Clock;
import java.util.Arrays;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import com.safecall.service.common.exception.BusinessException;
import com.safecall.service.common.exception.ErrorCode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class LiveTokenAccessInterceptor implements HandlerInterceptor {

	static final String CLIENT_ENVIRONMENT_HEADER = "X-Client-Environment";

	private final Set<String> allowedEnvironments;
	private final ClientIpResolver clientIpResolver;
	private final int requestLimit;
	private final long windowMillis;
	private final Clock clock;
	private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

	@Autowired
	public LiveTokenAccessInterceptor(
			@Value("${app.live-token.allowed-client-environments}") String allowedEnvironments,
			@Value("${app.live-token.trusted-proxy-cidrs:}") String trustedProxyCidrs,
			@Value("${app.live-token.rate-limit-requests}") int requestLimit,
			@Value("${app.live-token.rate-limit-window-seconds}") long windowSeconds) {
		this(allowedEnvironments, trustedProxyCidrs, requestLimit, windowSeconds, Clock.systemUTC());
	}

	LiveTokenAccessInterceptor(String allowedEnvironments, String trustedProxyCidrs,
			int requestLimit, long windowSeconds, Clock clock) {
		this.allowedEnvironments = Arrays.stream(allowedEnvironments.split(","))
				.map(String::trim)
				.filter(value -> !value.isBlank())
				.collect(java.util.stream.Collectors.toUnmodifiableSet());
		this.clientIpResolver = new ClientIpResolver(trustedProxyCidrs);
		this.requestLimit = requestLimit;
		this.windowMillis = windowSeconds * 1000;
		this.clock = clock;
	}

	@Override
	public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
		if (HttpMethod.OPTIONS.matches(request.getMethod())) {
			return true;
		}
		String environment = request.getHeader(CLIENT_ENVIRONMENT_HEADER);
		if (environment == null || !allowedEnvironments.contains(environment.trim())) {
			throw new BusinessException(ErrorCode.CLIENT_ENVIRONMENT_NOT_ALLOWED);
		}

		String clientIp = clientIpResolver.resolve(request);
		long now = clock.millis();
		Window current = windows.compute(clientIp, (ignored, existing) -> {
			if (existing == null || now - existing.startedAt() >= windowMillis) {
				return new Window(now, 1);
			}
			return new Window(existing.startedAt(), existing.count() + 1);
		});
		if (current.count() > requestLimit) {
			throw new BusinessException(ErrorCode.LIVE_TOKEN_RATE_LIMIT_EXCEEDED);
		}
		return true;
	}

	private record Window(long startedAt, int count) {
	}
}
