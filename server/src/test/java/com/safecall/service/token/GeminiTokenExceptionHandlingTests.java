package com.safecall.service.token;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.safecall.service.common.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.json.JsonMapper;

class GeminiTokenExceptionHandlingTests {

	@Test
	void returnsStandardErrorResponseWhenApiKeyIsMissing() throws Exception {
		GeminiTokenController controller = new GeminiTokenController(JsonMapper.builder().build());
		ReflectionTestUtils.setField(controller, "apiKey", "");
		MockMvc mockMvc = MockMvcBuilders.standaloneSetup(controller)
				.setControllerAdvice(new GlobalExceptionHandler())
				.build();

		mockMvc.perform(post("/api/live-token"))
				.andExpect(status().isInternalServerError())
				.andExpect(header().string("Cache-Control", "no-store"))
				.andExpect(jsonPath("$.timestamp").exists())
				.andExpect(jsonPath("$.status").value(500))
				.andExpect(jsonPath("$.code").value("G001"))
				.andExpect(jsonPath("$.message")
						.value("서버에 GEMINI_API_KEY가 설정되지 않았습니다."))
				.andExpect(jsonPath("$.errors").isEmpty())
				.andExpect(jsonPath("$.path").value("/api/live-token"));
	}
}
