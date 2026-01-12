export type BarcodeFormat = 'ean13' | 'code128';

type BarcodeModule = {
  isBar: boolean;
  width: number;
};

const EAN_L = [
  '0001101',
  '0011001',
  '0010011',
  '0111101',
  '0100011',
  '0110001',
  '0101111',
  '0111011',
  '0110111',
  '0001011',
];

const EAN_G = [
  '0100111',
  '0110011',
  '0011011',
  '0100001',
  '0011101',
  '0111001',
  '0000101',
  '0010001',
  '0001001',
  '0010111',
];

const EAN_R = [
  '1110010',
  '1100110',
  '1101100',
  '1000010',
  '1011100',
  '1001110',
  '1010000',
  '1000100',
  '1001000',
  '1110100',
];

const EAN_PARITY = [
  'LLLLLL',
  'LLGLGG',
  'LLGGLG',
  'LLGGGL',
  'LGLLGG',
  'LGGLLG',
  'LGGGLL',
  'LGLGLG',
  'LGLGGL',
  'LGGLGL',
];

const CODE128_PATTERNS = [
  '212222',
  '222122',
  '222221',
  '121223',
  '121322',
  '131222',
  '122213',
  '122312',
  '132212',
  '221213',
  '221312',
  '231212',
  '112232',
  '122132',
  '122231',
  '113222',
  '123122',
  '123221',
  '223211',
  '221132',
  '221231',
  '213212',
  '223112',
  '312131',
  '311222',
  '321122',
  '321221',
  '312212',
  '322112',
  '322211',
  '212123',
  '212321',
  '232121',
  '111323',
  '131123',
  '131321',
  '112313',
  '132113',
  '132311',
  '211313',
  '231113',
  '231311',
  '112133',
  '112331',
  '132131',
  '113123',
  '113321',
  '133121',
  '313121',
  '211331',
  '231131',
  '213113',
  '213311',
  '213131',
  '311123',
  '311321',
  '331121',
  '312113',
  '312311',
  '332111',
  '314111',
  '221411',
  '431111',
  '111224',
  '111422',
  '121124',
  '121421',
  '141122',
  '141221',
  '112214',
  '112412',
  '122114',
  '122411',
  '142112',
  '142211',
  '241211',
  '221114',
  '413111',
  '241112',
  '134111',
  '111242',
  '121142',
  '121241',
  '114212',
  '124112',
  '124211',
  '411212',
  '421112',
  '421211',
  '212141',
  '214121',
  '412121',
  '111143',
  '111341',
  '131141',
  '114113',
  '114311',
  '411113',
  '411311',
  '113141',
  '114131',
  '311141',
  '411131',
  '211412',
  '211214',
  '211232',
  '2331112',
];

export const normalizeBarcode = (value: string) =>
  value.replace(/\s+/g, '').trim().toUpperCase();

export const calculateEan13CheckDigit = (base: string) => {
  if (!/^\d{12}$/.test(base)) return null;
  const digits = base.split('').map((digit) => Number(digit));
  const sum = digits.reduce(
    (acc, digit, index) => acc + digit * (index % 2 === 0 ? 1 : 3),
    0,
  );
  const mod = sum % 10;
  return mod === 0 ? 0 : 10 - mod;
};

export const isValidEan13 = (value: string) => {
  if (!/^\d{13}$/.test(value)) return false;
  const base = value.slice(0, 12);
  const expected = calculateEan13CheckDigit(base);
  if (expected === null) return false;
  return Number(value[12]) === expected;
};

export const isValidCode128 = (value: string) => {
  if (!value) return false;
  if (value.length > 32) return false;
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 32 || code > 126) return false;
  }
  return true;
};

export const detectBarcodeFormat = (value: string): BarcodeFormat | null => {
  if (!value) return null;
  if (isValidEan13(value)) return 'ean13';
  if (isValidCode128(value)) return 'code128';
  return null;
};

export const generateEan13 = () => {
  const base = Array.from({ length: 12 })
    .map(() => Math.floor(Math.random() * 10))
    .join('');
  const checkDigit = calculateEan13CheckDigit(base);
  return checkDigit === null ? base : `${base}${checkDigit}`;
};

export const generateCode128 = (length = 10) => {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const safeLength = Math.min(Math.max(length, 6), 24);
  let value = '';
  for (let i = 0; i < safeLength; i += 1) {
    value += charset[Math.floor(Math.random() * charset.length)];
  }
  return value;
};

const binaryPatternToModules = (pattern: string): BarcodeModule[] => {
  if (!pattern) return [];
  const modules: BarcodeModule[] = [];
  let current = pattern[0];
  let width = 1;
  for (let i = 1; i < pattern.length; i += 1) {
    if (pattern[i] === current) {
      width += 1;
    } else {
      modules.push({ isBar: current === '1', width });
      current = pattern[i];
      width = 1;
    }
  }
  modules.push({ isBar: current === '1', width });
  return modules;
};

const widthPatternToModules = (pattern: string): BarcodeModule[] => {
  const modules: BarcodeModule[] = [];
  let isBar = true;
  for (const digit of pattern) {
    const width = Number(digit);
    if (!Number.isFinite(width) || width <= 0) continue;
    modules.push({ isBar, width });
    isBar = !isBar;
  }
  return modules;
};

const mergeModules = (modules: BarcodeModule[]) => {
  const merged: BarcodeModule[] = [];
  modules.forEach((module) => {
    const last = merged[merged.length - 1];
    if (last && last.isBar === module.isBar) {
      last.width += module.width;
    } else {
      merged.push({ ...module });
    }
  });
  return merged;
};

const buildEan13Modules = (value: string) => {
  if (!isValidEan13(value)) return [];
  const digits = value.split('');
  const first = Number(digits[0]);
  const leftDigits = digits.slice(1, 7);
  const rightDigits = digits.slice(7);
  const parity = EAN_PARITY[first];

  let pattern = '101';
  leftDigits.forEach((digit, index) => {
    const table = parity[index] === 'G' ? EAN_G : EAN_L;
    pattern += table[Number(digit)];
  });
  pattern += '01010';
  rightDigits.forEach((digit) => {
    pattern += EAN_R[Number(digit)];
  });
  pattern += '101';
  return binaryPatternToModules(pattern);
};

const encodeCode128B = (value: string) => {
  const dataCodes = Array.from(value).map((char) => {
    const code = char.charCodeAt(0) - 32;
    if (code < 0 || code > 95) {
      throw new Error('Caractere inválido no Code 128');
    }
    return code;
  });
  const startCode = 104;
  const checksum =
    (startCode +
      dataCodes.reduce((acc, code, index) => acc + code * (index + 1), 0)) %
    103;
  return [startCode, ...dataCodes, checksum, 106];
};

const buildCode128Modules = (value: string) => {
  if (!isValidCode128(value)) return [];
  const codes = encodeCode128B(value);
  const modules: BarcodeModule[] = [];
  codes.forEach((code) => {
    const pattern = CODE128_PATTERNS[code];
    modules.push(...widthPatternToModules(pattern));
  });
  modules.push({ isBar: false, width: 1 });
  modules.push({ isBar: true, width: 2 });
  return mergeModules(modules);
};

export const buildBarcodeModules = (
  format: BarcodeFormat,
  value: string,
  quietZone = 10,
): BarcodeModule[] => {
  const baseModules =
    format === 'ean13'
      ? buildEan13Modules(value)
      : buildCode128Modules(value);
  if (!baseModules.length) return [];
  const modules = [
    { isBar: false, width: quietZone },
    ...baseModules,
    { isBar: false, width: quietZone },
  ];
  return mergeModules(modules);
};

export const buildBarcodeSvgMarkup = ({
  value,
  format,
  height = 40,
  moduleWidth = 2,
  quietZone = 10,
}: {
  value: string;
  format: BarcodeFormat;
  height?: number;
  moduleWidth?: number;
  quietZone?: number;
}) => {
  const modules = buildBarcodeModules(format, value, quietZone);
  if (!modules.length) return null;

  let x = 0;
  const bars: string[] = [];
  modules.forEach((module) => {
    const width = module.width * moduleWidth;
    if (module.isBar) {
      bars.push(`<rect x="${x}" y="0" width="${width}" height="${height}" />`);
    }
    x += width;
  });

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x} ${height}" width="100%" height="${height}" preserveAspectRatio="none">
      <rect width="${x}" height="${height}" fill="#ffffff" />
      ${bars.join('')}
    </svg>
  `.trim();
};
