package com.safecall.service.token;

import java.util.Arrays;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class LiveTokenWebConfiguration implements WebMvcConfigurer {

	private final LiveTokenAccessInterceptor accessInterceptor;
	private final List<String> allowedOrigins;

	public LiveTokenWebConfiguration(
			LiveTokenAccessInterceptor accessInterceptor,
			@Value("${app.live-token.allowed-origins:}") String allowedOrigins) {
		this.accessInterceptor = accessInterceptor;
		this.allowedOrigins = Arrays.stream(allowedOrigins.split(","))
				.map(String::trim)
				.filter(value -> !value.isBlank())
				.toList();
	}

	@Override
	public void addCorsMappings(CorsRegistry registry) {
		if (!allowedOrigins.isEmpty()) {
			registry.addMapping("/api/live-token")
					.allowedOrigins(allowedOrigins.toArray(String[]::new))
					.allowedMethods("POST", "OPTIONS")
					.allowedHeaders("Content-Type", LiveTokenAccessInterceptor.CLIENT_ENVIRONMENT_HEADER)
					.allowCredentials(false)
					.maxAge(3600);
		}
	}

	@Override
	public void addInterceptors(InterceptorRegistry registry) {
		registry.addInterceptor(accessInterceptor)
				.addPathPatterns("/api/live-token");
	}
}
