const getWebCrypto = () => {
  if (typeof globalThis === 'undefined') return undefined;
  return globalThis.crypto;
};

export const createClientUuid = () => {
  const webCrypto = getWebCrypto();

  if (webCrypto && typeof webCrypto.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }

  if (webCrypto && typeof webCrypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    webCrypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
    return [
      hex.slice(0, 4).join(''),
      hex.slice(4, 6).join(''),
      hex.slice(6, 8).join(''),
      hex.slice(8, 10).join(''),
      hex.slice(10, 16).join(''),
    ].join('-');
  }

  return [
    Date.now().toString(16),
    Math.random().toString(16).slice(2),
    Math.random().toString(16).slice(2),
  ].join('-');
};

export const createClientId = (prefix = '') => `${prefix}${createClientUuid()}`;
