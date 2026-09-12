package com.safecall.service.token;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.HttpMethod.POST;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;

class GeminiTokenControllerTests {

	@Test
	void issuesTokenRestrictedToConfiguredAudioModelWithAutomaticTurns() {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		GeminiTokenController controller = new GeminiTokenController(
				builder.build(), JsonMapper.builder().build());
		ReflectionTestUtils.setField(controller, "apiKey", "test-api-key");
		ReflectionTestUtils.setField(controller, "tokenUrl", "https://example.test/auth_tokens");
		ReflectionTestUtils.setField(controller, "connectionTtlSeconds", 900);
		ReflectionTestUtils.setField(controller, "newSessionTtlSeconds", 60);
		ReflectionTestUtils.setField(
				controller, "liveModel", "models/gemini-3.1-flash-live-preview");

		server.expect(requestTo("https://example.test/auth_tokens"))
				.andExpect(method(POST))
				.andExpect(header("x-goog-api-key", "test-api-key"))
				.andExpect(jsonPath("$.uses").value(1))
				.andExpect(jsonPath("$.bidiGenerateContentSetup.model")
						.value("models/gemini-3.1-flash-live-preview"))
				.andExpect(jsonPath("$.bidiGenerateContentSetup.generationConfig.responseModalities[0]")
						.value("AUDIO"))
				.andExpect(jsonPath("$.bidiGenerateContentSetup.realtimeInputConfig.automaticActivityDetection.disabled")
						.value(false))
				.andExpect(jsonPath("$.bidiGenerateContentSetup.realtimeInputConfig.automaticActivityDetection.silenceDurationMs")
						.value(800))
				.andExpect(jsonPath("$.bidiGenerateContentSetup.systemInstruction.parts[0].text")
						.isString())
				.andExpect(jsonPath("$.bidiGenerateContentSetup.inputAudioTranscription").isMap())
				.andExpect(jsonPath("$.bidiGenerateContentSetup.outputAudioTranscription").isMap())
				.andRespond(withSuccess(
						"{\"name\":\"auth_tokens/example\"}", MediaType.APPLICATION_JSON));

		GeminiTokenController.LiveTokenResponse response = controller.createLiveToken().getBody();

		assertThat(response).isNotNull();
		assertThat(response.token()).isEqualTo("auth_tokens/example");
		assertThat(response.model()).isEqualTo("models/gemini-3.1-flash-live-preview");
		server.verify();
	}
}
