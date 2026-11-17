/** Public error messages only. Never forward raw gateway responses, tokens or keys. */
export class GuestAccessError extends Error {
  constructor(public code: string, message: string, public status?: number) {
    super(message);
    this.name = 'GuestAccessError';
  }
}
export function guestAccessError(error: unknown): GuestAccessError {
  if (error instanceof GuestAccessError) return error;
  const source = error && typeof error === 'object' ? error as {code?: string; status?: number; name?: string} : {};
  const code = typeof source.code === 'string' && /^[a-z0-9_]{1,64}$/.test(source.code) ? source.code : 'guest_auth_unavailable';
  const messages: Record<string,string> = {
    anonymous_provider_disabled: '게스트 입장이 꺼져 있어 공동 캠핑장에 연결할 수 없어요. 지금은 혼자 캠핑할 수 있어요.',
    signup_disabled: '새로운 캠퍼의 입장이 잠시 중지되어 있어요. 지금은 혼자 캠핑할 수 있어요.',
    over_request_rate_limit: '입장 요청이 잠시 몰렸어요. 조금 기다린 뒤 다시 연결해 주세요.',
    over_anonymous_users_rate_limit: '이 네트워크에서 게스트 입장을 많이 시도했어요. 잠시 뒤 다시 연결해 주세요.',
    captcha_failed: '입장 확인을 완료하지 못했어요. 잠시 뒤 다시 연결해 주세요.',
  };
  const network = source.name === 'AuthRetryableFetchError' || source.name === 'TypeError' || source.name === 'TimeoutError';
  const message = messages[code] ?? (source.status === 401 || source.status === 403
    ? '캠핑장 연결 설정을 확인하고 있어요. 지금은 혼자 캠핑할 수 있어요.'
    : network ? '인터넷 연결을 확인한 뒤 다시 연결해 주세요.'
    : '공동 캠핑장에 입장하지 못했어요. 잠시 뒤 다시 연결해 주세요.');
  return new GuestAccessError(network && code === 'guest_auth_unavailable' ? 'guest_auth_network' : code, message, source.status);
}
