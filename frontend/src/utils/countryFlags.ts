/**
 * Country flags utility - provides country code to flag emoji and SVG conversions
 * No external dependencies, no downloaded images needed
 */

// Map country names to ISO 3166-1 alpha-2 country codes
const COUNTRY_CODE_MAP: Record<string, string> = {
  // F1 Race Locations
  'australia': 'AU',
  'bahrain': 'BH',
  'china': 'CN',
  'azerbaijan': 'AZ',
  'spain': 'ES',
  'monaco': 'MC',
  'canada': 'CA',
  'france': 'FR',
  'austria': 'AT',
  'united kingdom': 'GB',
  'uk': 'GB',
  'england': 'GB',
  'germany': 'DE',
  'hungary': 'HU',
  'belgium': 'BE',
  'italy': 'IT',
  'singapore': 'SG',
  'russia': 'RU',
  'japan': 'JP',
  'united states': 'US',
  'usa': 'US',
  'mexico': 'MX',
  'uae': 'AE',
  'emirates': 'AE',
  'united arab emirates': 'AE',
  'qatar': 'QA',
  'saudi arabia': 'SA',
  'netherlands': 'NL',
  'south korea': 'KR',
  'korea': 'KR',
  'greece': 'GR',
  'iran': 'IR',
  'los angeles': 'US',
  'las vegas': 'US',
  'miami': 'US',
  'austin': 'US',
  'texas': 'US',

  // F1 Driver Countries
  'finland': 'FI',
  'denmark': 'DK',
  'new zealand': 'NZ',
  'sweden': 'SE',
  'poland': 'PL',
  'switzerland': 'CH',
  'india': 'IN',
  'hong kong': 'HK',
  'ireland': 'IE',
  'liechtenstein': 'LI',
  'luxembourg': 'LU',
  'israel': 'IL',
  'vietnam': 'VN',
  'south africa': 'ZA',
  'egypt': 'EG',
  'argentina': 'AR',
  'paraguay': 'PY',
  'uruguay': 'UY',
  'venezuela': 'VE',
  'colombia': 'CO',
  'peru': 'PE',
  'czech republic': 'CZ',
  'slovakia': 'SK',
  'slovenia': 'SI',
  'romania': 'RO',
  'croatia': 'HR',
  'serbia': 'RS',
  'ukraine': 'UA',
  'belarus': 'BY',
  'georgia': 'GE',
  'portugal': 'PT',
};

/**
 * Get country code from location string
 */
export const getCountryCode = (location: string): string => {
  if (!location) return '';
  const countryPart = location.split(',').pop()?.trim().toLowerCase() || '';
  return COUNTRY_CODE_MAP[countryPart] || '';
};

/**
 * Convert country code to flag emoji
 * Uses regional indicator symbols to create flag emojis
 */
export const countryCodeToFlagEmoji = (countryCode: string): string => {
  if (!countryCode || countryCode.length !== 2) return '🏁';

  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));

  return String.fromCodePoint(...codePoints);
};

/**
 * Get flag emoji from location string
 */
export const getFlagEmoji = (location: string): string => {
  const code = getCountryCode(location);
  return countryCodeToFlagEmoji(code);
};

/**
 * SVG-based country flags for better control
 * Returns SVG data URI for a country flag
 */
export const getCountryFlagSVG = (countryCode: string): string => {
  const flags: Record<string, string> = {
    'AU': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iIzAwMDI3NiIvPjwvc3ZnPg==',
    'BH': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iI2NFMDAwMCIvPjwvc3ZnPg==',
    'CN': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iI0RFMjkxMCIvPjwvc3ZnPg==',
    'AZ': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iIzAwQUZDQSIvPjwvc3ZnPg==',
    'ES': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI0ZGQzQwMCIvPjxyZWN0IHk9IjMwMCIgd2lkdGg9IjkwMCIgaGVpZ2h0PSIzMDAiIGZpbGw9IiNDNjBCMUUiLz48L3N2Zz4=',
    'MC': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iNDUwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iI0VGMzM0NiIvPjxyZWN0IHg9IjQ1MCIgd2lkdGg9IjQ1MCIgaGVpZ2h0PSI2MDAiIGZpbGw9IiNGRkZGRkYiLz48L3N2Zz4=',
    'CA': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iI0ZGRkZGRiIvPjwvc3ZnPg==',
    'FR': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iIzAwNTFCQSIvPjxyZWN0IHg9IjMwMCIgd2lkdGg9IjMwMCIgaGVpZ2h0PSI2MDAiIGZpbGw9IiNGRkZGRkYiLz48cmVjdCB4PSI2MDAiIHdpZHRoPSIzMDAiIGhlaWdodD0iNjAwIiBmaWxsPSIjRUYyQzJFIi8+PC9zdmc+',
    'AT': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iI2VCMDAWIIICL+C5c3ZnPg==',
    'GB': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iIzAxMjE2OSIvPjwvc3ZnPg==',
    'DE': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iIzAwMDAwMCIvPjxyZWN0IHk9IjIwMCIgd2lkdGg9IjkwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiNEMDAwMDAiLz48cmVjdCB5PSI0MDAiIHdpZHRoPSI5MDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjRkZDRTAwIi8+PC9zdmc+',
    'HU': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI0NGMzMzOCIvPjxyZWN0IHk9IjIwMCIgd2lkdGg9IjkwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiNGRkZGRkYiLz48cmVjdCB5PSI0MDAiIHdpZHRoPSI5MDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjMDBzNDQyMSIvPjwvc3ZnPg==',
    'BE': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iIzAwMDAwMCIvPjxyZWN0IHk9IjIwMCIgd2lkdGg9IjkwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiNGRkU0MDAwIi8+PHJlY3QgeT0iNDAwIiB3aWR0aD0iOTAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI0ZGRkZGRiIvPjwvc3ZnPg==',
    'IT': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iIzAwOUI0NiIvPjxyZWN0IHg9IjMwMCIgd2lkdGg9IjMwMCIgaGVpZ2h0PSI2MDAiIGZpbGw9IiNGRkZGRkYiLz48cmVjdCB4PSI2MDAiIHdpZHRoPSIzMDAiIGhlaWdodD0iNjAwIiBmaWxsPSIjQ0UyQjM3Ii8+PC9zdmc+',
    'SG': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iI0MzMzEzMyIvPjwvc3ZnPg==',
    'RU': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iIkZGRkZGRiIvPjxyZWN0IHk9IjIwMCIgd2lkdGg9IjkwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiMwMDM5QTYiLz48cmVjdCB5PSI0MDAiIHdpZHRoPSI5MDAIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI0UyMzE1MCIvPjwvc3ZnPg==',
    'JP': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iI0JDMDAyRCIvPjwvc3ZnPg==',
    'US': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iIzMzMzM4RiIvPjwvc3ZnPg==',
    'MX': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iI0dFRjBDRSIvPjxyZWN0IHg9IjMwMCIgd2lkdGg9IjMwMCIgaGVpZ2h0PSI2MDAiIGZpbGw9IiNDRDMzMzMiLz48cmVjdCB4PSI2MDAiIHdpZHRoPSIzMDAiIGhlaWdodD0iNjAwIiBmaWxsPSIjMEE0MzM1Ii8+PC9zdmc+',
    'BR': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iIzAwOEMwOSIvPjwvc3ZnPg==',
    'AE': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iI0NFMTEyNiIvPjwvc3ZnPg==',
    'TH': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iI0ZDQjE0MCIvPjwvc3ZnPg==',
    'TR': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iI0UzMDA1MCIvPjwvc3ZnPg==',
    'QA': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iI0NDMjU0MCIvPjwvc3ZnPg==',
    'SA': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iIzAwNzczQiIvPjwvc3ZnPg==',
    'NL': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI0FFMEYwNiIvPjxyZWN0IHk9IjIwMCIgd2lkdGg9IjkwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiNGRkZGRkYiLz48cmVjdCB5PSI0MDAiIHdpZHRoPSI5MDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjMDEyMTY5Ii8+PC9zdmc+',
    'KR': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iI0M2MDE0OCIvPjwvc3ZnPg==',
    // F1 Driver Countries
    'FI': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iI0ZGRkZGRiIvPjxyZWN0IHg9IjMwMCIgeT0iMjAwIiB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iIzAwMzM5OSIvPjwvc3ZnPg==',
    'DK': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iI0MzMzMzMyIvPjwvc3ZnPg==',
    'NZ': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iIzAwMEMzRCIvPjwvc3ZnPg==',
    'SE': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iIzAwNTZGNSIvPjwvc3ZnPg==',
    'PL': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI0ZGRkZGRiIvPjxyZWN0IHk9IjMwMCIgd2lkdGg9IjkwMCIgaGVpZ2h0PSIzMDAiIGZpbGw9IiNFQzEwMjUiLz48L3N2Zz4=',
    'CH': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iI0ZFMzAwMCIvPjwvc3ZnPg==',
    'IN': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI0ZGNzcxNiIvPjxyZWN0IHk9IjIwMCIgd2lkdGg9IjkwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiNGRkZGRkYiLz48cmVjdCB5PSI0MDAiIHdpZHRoPSI5MDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjMTI4NDEyIi8+PC9zdmc+',
    'HK': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iI0RFMjkxMCIvPjwvc3ZnPg==',
    'IE': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iIzMzOTkzMyIvPjxyZWN0IHg9IjMwMCIgd2lkdGg9IjMwMCIgaGVpZ2h0PSI2MDAiIGZpbGw9IiNGRkZGRkYiLz48cmVjdCB4PSI2MDAiIHdpZHRoPSIzMDAiIGhlaWdodD0iNjAwIiBmaWxsPSIjRkYzMyIvPjwvc3ZnPg==',
    'LI': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iI0ZGMzMzMyIvPjwvc3ZnPg==',
    'LU': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI0ZGMzMzMyIvPjxyZWN0IHk9IjIwMCIgd2lkdGg9IjkwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiNGRkZGRkYiLz48cmVjdCB5PSI0MDAiIHdpZHRoPSI5MDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjMDAwQzgyIi8+PC9zdmc+',
    'IL': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iI0ZGRkZGRiIvPjwvc3ZnPg==',
    'VN': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iI0VBMTRCKL9zdmc+',
    'ZA': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iIzAwNjYwMCIvPjwvc3ZnPg==',
    'EG': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI0NFMTEyNiIvPjxyZWN0IHk9IjIwMCIgd2lkdGg9IjkwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiNGRkZGRkYiLz48cmVjdCB5PSI0MDAiIHdpZHRoPSI5MDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjMDAwMDAwIi8+PC9zdmc+',
    'CZ': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI0ZGRkZGRiIvPjxyZWN0IHk9IjMwMCIgd2lkdGg9IjkwMCIgaGVpZ2h0PSIzMDAiIGZpbGw9IiNFQTAwMDYiLz48L3N2Zz4=',
    'SK': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI0ZGRkZGRiIvPjxyZWN0IHk9IjIwMCIgd2lkdGg9IjkwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiNFQTAwMDYiLz48cmVjdCB5PSI0MDAiIHdpZHRoPSI5MDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjMDAwMDY2Ii8+PC9zdmc+',
    'SI': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI0ZGRkZGRiIvPjxyZWN0IHk9IjIwMCIgd2lkdGg9IjkwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiNFQTAwMDYiLz48cmVjdCB5PSI0MDAiIHdpZHRoPSI5MDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjMDAwMzY2Ii8+PC9zdmc+',
    'RO': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iIzAwMzM4MyIvPjxyZWN0IHg9IjMwMCIgd2lkdGg9IjMwMCIgaGVpZ2h0PSI2MDAiIGZpbGw9IiNGRkZGRkYiLz48cmVjdCB4PSI2MDAiIHdpZHRoPSIzMDAiIGhlaWdodD0iNjAwIiBmaWxsPSIjQ0UwMDAwIi8+PC9zdmc+',
    'HR': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI0YxMDAwMCIvPjxyZWN0IHk9IjIwMCIgd2lkdGg9IjkwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiNGRkZGRkYiLz48cmVjdCB5PSI0MDAiIHdpZHRoPSI5MDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjMzMzMzMzIi8+PC9zdmc+',
    'RS': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iIzMzMzMzMyIvPjxyZWN0IHk9IjMwMCIgd2lkdGg9IjkwMCIgaGVpZ2h0PSIzMDAiIGZpbGw9IiNGRkZGRkYiLz48L3N2Zz4=',
    'UA': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iIzAwNDVGNCIvPjxyZWN0IHk9IjMwMCIgd2lkdGg9IjkwMCIgaGVpZ2h0PSIzMDAiIGZpbGw9IiNGRkNDMDAiLz48L3N2Zz4=',
    'BY': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI0MxMDAwQiIvPjxyZWN0IHk9IjIwMCIgd2lkdGg9IjkwMCIgaGVpZ2h0PSI0MDAiIGZpbGw9IiNGRkZGRkYiLz48L3N2Zz4=',
    'GE': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iI0ZGRkZGRiIvPjwvc3ZnPg==',
    'PT': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iNDUwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iIzAwNjYzMyIvPjxyZWN0IHg9IjQ1MCIgd2lkdGg9IjQ1MCIgaGVpZ2h0PSI2MDAiIGZpbGw9IiNGRjAwMDAiLz48L3N2Zz4=',
  };

  return flags[countryCode] || '';
};

/**
 * Get flag emoji from location string (simple and doesn't need SVG)
 */
export const getLocationFlagEmoji = (location: string): string => {
  return getFlagEmoji(location);
};

/**
 * Get flag emoji from driver country
 */
export const getDriverCountryFlagEmoji = (country: string): string => {
  if (!country) return '🏁';
  const code = COUNTRY_CODE_MAP[country.toLowerCase()] || '';
  return countryCodeToFlagEmoji(code);
};
