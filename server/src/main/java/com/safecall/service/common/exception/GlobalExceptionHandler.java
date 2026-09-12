package com.safecall.service.common.exception;

import java.util.List;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

	private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

	@ExceptionHandler(BusinessException.class)
	public ResponseEntity<ErrorResponse> handleBusinessException(
			BusinessException exception,
			HttpServletRequest request) {
		ErrorCode errorCode = exception.getErrorCode();
		return response(
				errorCode,
				ErrorResponse.of(errorCode, exception.getMessage(), request.getRequestURI()));
	}

	@ExceptionHandler(MethodArgumentNotValidException.class)
	public ResponseEntity<ErrorResponse> handleValidationException(
			MethodArgumentNotValidException exception,
			HttpServletRequest request) {
		List<ErrorResponse.FieldErrorDetail> errors = exception.getBindingResult()
				.getFieldErrors()
				.stream()
				.map(error -> new ErrorResponse.FieldErrorDetail(
						error.getField(),
						error.getRejectedValue(),
						error.getDefaultMessage()))
				.toList();
		ErrorCode errorCode = ErrorCode.INVALID_INPUT;
		return response(
				errorCode,
				ErrorResponse.validation(errorCode, errors, request.getRequestURI()));
	}

	@ExceptionHandler(Exception.class)
	public ResponseEntity<ErrorResponse> handleUnexpectedException(
			Exception exception,
			HttpServletRequest request) {
		log.error("Unhandled exception", exception);
		ErrorCode errorCode = ErrorCode.INTERNAL_SERVER_ERROR;
		return response(
				errorCode,
				ErrorResponse.of(errorCode, errorCode.getMessage(), request.getRequestURI()));
	}

	private ResponseEntity<ErrorResponse> response(ErrorCode errorCode, ErrorResponse body) {
		return ResponseEntity.status(errorCode.getStatus())
				.cacheControl(CacheControl.noStore())
				.body(body);
	}
}
