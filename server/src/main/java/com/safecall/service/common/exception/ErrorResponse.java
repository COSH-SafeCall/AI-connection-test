package com.safecall.service.common.exception;

import java.time.LocalDateTime;
import java.util.List;

public record ErrorResponse(
		LocalDateTime timestamp,
		int status,
		String code,
		String message,
		List<FieldErrorDetail> errors,
		String path) {

	public static ErrorResponse of(ErrorCode errorCode, String message, String path) {
		return new ErrorResponse(
				LocalDateTime.now(),
				errorCode.getStatus().value(),
				errorCode.getCode(),
				message,
				List.of(),
				path);
	}

	public static ErrorResponse validation(
			ErrorCode errorCode,
			List<FieldErrorDetail> errors,
			String path) {
		return new ErrorResponse(
				LocalDateTime.now(),
				errorCode.getStatus().value(),
				errorCode.getCode(),
				errorCode.getMessage(),
				errors,
				path);
	}

	public record FieldErrorDetail(String field, Object value, String reason) {
	}
}
