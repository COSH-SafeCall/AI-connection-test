import Constants from 'expo-constants';

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const expoHost = Constants.expoConfig?.hostUri;
const tunnelApiBaseUrl =
  expoHost?.endsWith('.exp.direct') || expoHost?.endsWith('.ngrok-free.dev')
    ? `https://${expoHost}`
    : undefined;

export const API_BASE_URL = stripTrailingSlash(
  tunnelApiBaseUrl ?? process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8080',
);

export const CLIENT_ENVIRONMENT =
  process.env.EXPO_PUBLIC_CLIENT_ENVIRONMENT ?? 'development';
