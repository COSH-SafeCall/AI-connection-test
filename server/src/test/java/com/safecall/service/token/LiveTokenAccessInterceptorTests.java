package com.safecall.service.token;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import com.safecall.service.common.exception.BusinessException;
import com.safecall.service.common.exception.ErrorCode;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class LiveTokenAccessInterceptorTests {

	private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-09-09T00:00:00Z"), ZoneOffset.UTC);

	@Test
	void rejectsMissingOrUnknownClientEnvironment() {
		LiveTokenAccessInterceptor interceptor = interceptor(10);
		MockHttpServletRequest request = request();

		assertThatThrownBy(() -> interceptor.preHandle(
				request, new MockHttpServletResponse(), new Object()))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						org.assertj.core.api.Assertions.assertThat(exception.getErrorCode())
								.isEqualTo(ErrorCode.CLIENT_ENVIRONMENT_NOT_ALLOWED));
	}

	@Test
	void rateLimitsAnAllowedEnvironmentByResolvedIp() {
		LiveTokenAccessInterceptor interceptor = interceptor(1);
		MockHttpServletRequest request = request();
		request.addHeader(LiveTokenAccessInterceptor.CLIENT_ENVIRONMENT_HEADER, "development");
		interceptor.preHandle(request, new MockHttpServletResponse(), new Object());

		assertThatThrownBy(() -> interceptor.preHandle(
				request, new MockHttpServletResponse(), new Object()))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						org.assertj.core.api.Assertions.assertThat(exception.getErrorCode())
								.isEqualTo(ErrorCode.LIVE_TOKEN_RATE_LIMIT_EXCEEDED));
	}

	private LiveTokenAccessInterceptor interceptor(int limit) {
		return new LiveTokenAccessInterceptor("development,production", "10.0.0.0/8", limit, 60, CLOCK);
	}

	private MockHttpServletRequest request() {
		MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/live-token");
		request.setRemoteAddr("198.51.100.2");
		return request;
	}
}
