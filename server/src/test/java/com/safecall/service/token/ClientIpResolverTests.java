package com.safecall.service.token;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

class ClientIpResolverTests {

	@Test
	void ignoresForwardedHeadersFromUntrustedPeers() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr("203.0.113.8");
		request.addHeader("X-Forwarded-For", "198.51.100.40");

		assertThat(new ClientIpResolver("10.0.0.0/8").resolve(request))
				.isEqualTo("203.0.113.8");
	}

	@Test
	void removesTrustedProxyHopsFromTheRight() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr("10.0.0.5");
		request.addHeader("X-Forwarded-For", "198.51.100.40, 10.0.0.4");

		assertThat(new ClientIpResolver("10.0.0.0/8").resolve(request))
				.isEqualTo("198.51.100.40");
	}
}
