import { useAuthStore } from '../stores/authStore';

export const fetchWithAuth = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const { accessToken, refreshAccessToken } = useAuthStore.getState();
  const headers: HeadersInit = {
    ...(init.headers || {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };

  let response = await fetch(input, { ...init, headers });

  if (response.status === 401 && accessToken) {
    try {
      await refreshAccessToken();
      const newAccessToken = useAuthStore.getState().accessToken;
      if (newAccessToken) {
        response = await fetch(input, {
          ...init,
          headers: {
            ...(init.headers || {}),
            Authorization: `Bearer ${newAccessToken}`,
          },
        });
      }
    } catch {
      // ignore refresh errors
    }
  }

  return response;
};
