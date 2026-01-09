const pad2 = (value: number) => value.toString().padStart(2, '0');

const normalizeDateInput = (value?: string | null) => {
  if (!value) return null;
  return value.split('T')[0];
};

export const parseDateInput = (value?: string | null) => {
  const normalized = normalizeDateInput(value);
  if (!normalized) return null;
  const [yearStr, monthStr, dayStr] = normalized.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
};

export const formatDateBr = (value?: string | null) => {
  const date = parseDateInput(value);
  if (!date) return '-';
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
};

const isLeapYear = (year: number) =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

const getBirthdayDateForYear = (value?: string | null, year?: number) => {
  const date = parseDateInput(value);
  if (!date) return null;
  const targetYear = year ?? new Date().getFullYear();
  let month = date.getMonth();
  let day = date.getDate();
  if (month === 1 && day === 29 && !isLeapYear(targetYear)) {
    day = 28;
  }
  return new Date(targetYear, month, day);
};

export const calculateAge = (value?: string | null, referenceDate: Date = new Date()) => {
  const birthDate = parseDateInput(value);
  if (!birthDate) return null;
  let age = referenceDate.getFullYear() - birthDate.getFullYear();
  const hasHadBirthday =
    referenceDate.getMonth() > birthDate.getMonth() ||
    (referenceDate.getMonth() === birthDate.getMonth() &&
      referenceDate.getDate() >= birthDate.getDate());
  if (!hasHadBirthday) age -= 1;
  return age;
};

export const getAgeAtYear = (value?: string | null, year?: number) => {
  const birthDate = parseDateInput(value);
  if (!birthDate) return null;
  const targetYear = year ?? new Date().getFullYear();
  return targetYear - birthDate.getFullYear();
};

export const getBirthMonth = (value?: string | null) => {
  const date = parseDateInput(value);
  if (!date) return null;
  return date.getMonth() + 1;
};

export const getBirthDay = (value?: string | null) => {
  const date = parseDateInput(value);
  if (!date) return null;
  return date.getDate();
};

export const formatMonthDay = (value?: string | null) => {
  const date = parseDateInput(value);
  if (!date) return '-';
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}`;
};

export const isBirthdayToday = (value?: string | null, referenceDate: Date = new Date()) => {
  const birthday = getBirthdayDateForYear(value, referenceDate.getFullYear());
  if (!birthday) return false;
  return (
    birthday.getMonth() === referenceDate.getMonth() &&
    birthday.getDate() === referenceDate.getDate()
  );
};

export const isBirthdayInMonth = (value?: string | null, month: number) => {
  const birthMonth = getBirthMonth(value);
  return birthMonth === month;
};

export const isBirthdayWithinDays = (
  value?: string | null,
  daysAhead: number = 7,
  referenceDate: Date = new Date(),
) => {
  const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  let candidate = getBirthdayDateForYear(value, start.getFullYear());
  if (!candidate) return false;
  if (candidate < start) {
    candidate = getBirthdayDateForYear(value, start.getFullYear() + 1);
  }
  if (!candidate) return false;
  const diffMs = candidate.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= daysAhead;
};
