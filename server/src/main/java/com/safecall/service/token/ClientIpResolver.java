package com.safecall.service.token;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import jakarta.servlet.http.HttpServletRequest;

final class ClientIpResolver {

	private final List<CidrBlock> trustedProxies;

	ClientIpResolver(String trustedProxyCidrs) {
		this.trustedProxies = csv(trustedProxyCidrs).stream().map(CidrBlock::parse).toList();
	}

	String resolve(HttpServletRequest request) {
		String remoteAddress = normalize(request.getRemoteAddr());
		if (!isTrusted(remoteAddress)) {
			return remoteAddress;
		}

		List<String> forwarded = forwardedAddresses(request.getHeader("Forwarded"));
		if (forwarded.isEmpty()) {
			forwarded = csv(request.getHeader("X-Forwarded-For"));
		}
		forwarded.add(remoteAddress);

		for (int index = forwarded.size() - 1; index >= 0; index--) {
			String address = normalize(forwarded.get(index));
			if (isIpLiteral(address) && !isTrusted(address)) {
				return address;
			}
		}
		return remoteAddress;
	}

	private boolean isTrusted(String address) {
		return trustedProxies.stream().anyMatch(cidr -> cidr.contains(address));
	}

	private static List<String> forwardedAddresses(String header) {
		List<String> addresses = new ArrayList<>();
		for (String element : csv(header)) {
			for (String parameter : element.split(";")) {
				String[] pair = parameter.trim().split("=", 2);
				if (pair.length == 2 && pair[0].equalsIgnoreCase("for")) {
					addresses.add(pair[1]);
				}
			}
		}
		return addresses;
	}

	private static List<String> csv(String value) {
		if (value == null || value.isBlank()) {
			return new ArrayList<>();
		}
		return new ArrayList<>(Arrays.stream(value.split(","))
				.map(String::trim)
				.filter(item -> !item.isBlank())
				.toList());
	}

	private static String normalize(String input) {
		if (input == null) {
			return "unknown";
		}
		String value = input.trim().replace("\"", "");
		if (value.startsWith("[")) {
			int bracket = value.indexOf(']');
			return bracket > 0 ? value.substring(1, bracket) : "unknown";
		}
		if (value.matches("\\d{1,3}(?:\\.\\d{1,3}){3}:\\d+")) {
			return value.substring(0, value.lastIndexOf(':'));
		}
		return value;
	}

	private static boolean isIpLiteral(String value) {
		return value.matches("\\d{1,3}(?:\\.\\d{1,3}){3}") || value.contains(":");
	}

	private record CidrBlock(byte[] network, int prefixLength) {

		static CidrBlock parse(String value) {
			String[] parts = value.split("/", 2);
			try {
				byte[] address = InetAddress.getByName(parts[0]).getAddress();
				int bits = address.length * 8;
				int prefix = parts.length == 2 ? Integer.parseInt(parts[1]) : bits;
				if (prefix < 0 || prefix > bits) {
					throw new IllegalArgumentException("Invalid CIDR prefix: " + value);
				}
				return new CidrBlock(address, prefix);
			} catch (UnknownHostException | NumberFormatException exception) {
				throw new IllegalArgumentException("Invalid trusted proxy CIDR: " + value, exception);
			}
		}

		boolean contains(String candidate) {
			if (!isIpLiteral(candidate)) {
				return false;
			}
			try {
				byte[] address = InetAddress.getByName(candidate).getAddress();
				if (address.length != network.length) {
					return false;
				}
				int fullBytes = prefixLength / 8;
				int remainingBits = prefixLength % 8;
				for (int i = 0; i < fullBytes; i++) {
					if (address[i] != network[i]) return false;
				}
				if (remainingBits == 0) return true;
				int mask = 0xff << (8 - remainingBits);
				return (address[fullBytes] & mask) == (network[fullBytes] & mask);
			} catch (UnknownHostException exception) {
				return false;
			}
		}
	}
}
