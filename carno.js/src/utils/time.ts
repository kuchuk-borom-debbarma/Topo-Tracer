/**
 * Returns the current time as a UTC epoch timestamp in milliseconds.
 * Useful for microsecond lifecycle calculations and database storage.
 * 
 * @param date Optional Date instance, defaults to the current system time.
 * @returns Number of milliseconds since January 1, 1970, UTC.
 */
export function getUTCMilliseconds(date: Date = new Date()): number {
  return date.getTime();
}

/**
 * Creates a Date instance forced/normalized to the current UTC moment.
 * 
 * @returns A fresh Date object representing the current UTC time.
 */
export function getUTCDate(): Date {
  return new Date();
}
