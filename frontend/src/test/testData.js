export const mockUser = { name: 'Анна', email: 'anna@example.ru' };
export const mockSession = { access: 'access-token', user: mockUser };

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
