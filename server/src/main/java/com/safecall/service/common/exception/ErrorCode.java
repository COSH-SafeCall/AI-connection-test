package com.safecall.service.common.exception;

import org.springframework.http.HttpStatus;

public enum ErrorCode {

	INVALID_INPUT(HttpStatus.BAD_REQUEST, "C001", "입력값이 올바르지 않습니다."),
	GEMINI_API_KEY_NOT_CONFIGURED(
			HttpStatus.INTERNAL_SERVER_ERROR,
			"G001",
			"서버에 GEMINI_API_KEY가 설정되지 않았습니다."),
	GEMINI_TOKEN_ISSUANCE_FAILED(
			HttpStatus.BAD_GATEWAY,
			"G002",
			"Gemini 토큰 발급에 실패했습니다."),
	CLIENT_ENVIRONMENT_NOT_ALLOWED(
			HttpStatus.FORBIDDEN,
			"G003",
			"허용되지 않은 클라이언트 환경입니다."),
	LIVE_TOKEN_RATE_LIMIT_EXCEEDED(
			HttpStatus.TOO_MANY_REQUESTS,
			"G004",
			"Gemini 토큰 요청 한도를 초과했습니다."),
	INTERNAL_SERVER_ERROR(
			HttpStatus.INTERNAL_SERVER_ERROR,
			"C999",
			"서버 내부 오류가 발생했습니다.");

	private final HttpStatus status;
	private final String code;
	private final String message;

	ErrorCode(HttpStatus status, String code, String message) {
		this.status = status;
		this.code = code;
		this.message = message;
	}

	public HttpStatus getStatus() {
		return status;
	}

	public String getCode() {
		return code;
	}

	public String getMessage() {
		return message;
	}
}
