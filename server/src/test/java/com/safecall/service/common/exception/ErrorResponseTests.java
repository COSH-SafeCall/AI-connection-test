package com.safecall.service.common.exception;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class ErrorResponseTests {

	@Test
	void serializesFieldErrorUsingStandardContract() {
		ErrorResponse.FieldErrorDetail error = new ErrorResponse.FieldErrorDetail(
				"serialNumber", "", "시리얼 넘버는 필수 입력값입니다.");

		JsonNode json = JsonMapper.builder().build().valueToTree(error);

		assertThat(json.path("field").asString()).isEqualTo("serialNumber");
		assertThat(json.path("value").asString()).isEmpty();
		assertThat(json.path("reason").asString())
				.isEqualTo("시리얼 넘버는 필수 입력값입니다.");
		assertThat(json.has("message")).isFalse();
	}
}
