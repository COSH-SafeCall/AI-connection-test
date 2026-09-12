package com.safecall.service.token;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

@SpringBootTest(properties = {
		"app.gemini.api-key=",
		"app.live-token.allowed-client-environments=test",
		"app.live-token.allowed-origins=https://app.example.test",
		"app.live-token.rate-limit-requests=10"
})
class LiveTokenWebSecurityTests {

	@Autowired
	private WebApplicationContext context;

	private MockMvc mockMvc;

	@BeforeEach
	void setUp() {
		mockMvc = MockMvcBuilders.webAppContextSetup(context).build();
	}

	@Test
	void allowsConfiguredCorsPreflightWithoutIssuingAToken() throws Exception {
		mockMvc.perform(options("/api/live-token")
					.header("Origin", "https://app.example.test")
					.header("Access-Control-Request-Method", "POST")
					.header("Access-Control-Request-Headers", "X-Client-Environment"))
				.andExpect(status().isOk())
				.andExpect(header().string("Access-Control-Allow-Origin", "https://app.example.test"))
				.andExpect(header().string("Access-Control-Allow-Methods", "POST,OPTIONS"));
	}

	@Test
	void rejectsTokenRequestWithoutAnAllowlistedEnvironment() throws Exception {
		mockMvc.perform(post("/api/live-token"))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("G003"));
	}

	@Test
	void rejectsUnlistedBrowserOrigin() throws Exception {
		mockMvc.perform(post("/api/live-token")
					.header("Origin", "https://evil.example.test")
					.header("X-Client-Environment", "test"))
				.andExpect(status().isForbidden());
	}
}
