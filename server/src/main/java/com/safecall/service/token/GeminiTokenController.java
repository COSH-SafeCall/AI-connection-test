package com.safecall.service.token;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import com.safecall.service.common.exception.BusinessException;
import com.safecall.service.common.exception.ErrorCode;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@RestController
@RequestMapping("/api")
public class GeminiTokenController {

	private final RestClient restClient;
	private final ObjectMapper objectMapper;

	@Value("${app.gemini.api-key}")
	private String apiKey;

	@Value("${app.gemini.token-url}")
	private String tokenUrl;

	@Value("${app.gemini.connection-ttl-seconds}")
	private Integer connectionTtlSeconds;

	@Value("${app.gemini.new-session-ttl-seconds}")
	private Integer newSessionTtlSeconds;

	@Value("${app.gemini.live-model}")
	private String liveModel;

	@Autowired
	public GeminiTokenController(ObjectMapper objectMapper) {
		this(RestClient.create(), objectMapper);
	}

	GeminiTokenController(RestClient restClient, ObjectMapper objectMapper) {
		this.restClient = restClient;
		this.objectMapper = objectMapper;
	}

	@PostMapping("/live-token")
	public ResponseEntity<LiveTokenResponse> createLiveToken() {
		if (apiKey == null || apiKey.isBlank()) {
			throw new BusinessException(ErrorCode.GEMINI_API_KEY_NOT_CONFIGURED);
		}

		Instant now = Instant.now();
		Map<String, Object> requestBody = Map.of(
				"uses", 1,
				"expireTime", now.plusSeconds(connectionTtlSeconds).toString(),
				"newSessionExpireTime", now.plusSeconds(newSessionTtlSeconds).toString(),
				"bidiGenerateContentSetup", Map.of(
						"model", liveModel,
						"generationConfig", Map.of(
								"responseModalities", List.of("AUDIO")),
						"realtimeInputConfig", Map.of(
								"automaticActivityDetection", Map.of(
										"disabled", false,
										"endOfSpeechSensitivity", "END_SENSITIVITY_LOW",
										"silenceDurationMs", 800)),
						"systemInstruction", Map.of(
								"parts", List.of(Map.of(
										"text", "You are SafeCall, a warm and natural AI phone companion. "
												+ "Respond in the caller's language with concise, conversational speech. "
												+ "Avoid markdown, lists, and long monologues. React naturally to interruptions."))),
						"inputAudioTranscription", Map.of(),
						"outputAudioTranscription", Map.of()));

		LiveTokenResponse token = restClient.post()
				.uri(tokenUrl)
				.header("x-goog-api-key", apiKey)
				.contentType(MediaType.APPLICATION_JSON)
				.body(requestBody)
				.exchange((request, upstream) -> {
					JsonNode body = objectMapper.readTree(upstream.getBody());
					if (!upstream.getStatusCode().is2xxSuccessful()) {
						String message = body.path("error").path("message")
								.asString(ErrorCode.GEMINI_TOKEN_ISSUANCE_FAILED.getMessage());
						throw new BusinessException(ErrorCode.GEMINI_TOKEN_ISSUANCE_FAILED, message);
					}
					return new LiveTokenResponse(body.path("name").asString(), liveModel,
							now.plusSeconds(connectionTtlSeconds));
				});

		return ResponseEntity.ok()
				.cacheControl(CacheControl.noStore())
				.body(token);
	}

	public record LiveTokenResponse(String token, String model, Instant expiresAt) {
	}
}
