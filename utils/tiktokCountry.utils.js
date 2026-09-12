const TIKTOK_COUNTRY_CODES = {
  "United States": "US",
  "United Kingdom": "GB",
  Canada: "CA",
  Australia: "AU",
  Germany: "DE",
  France: "FR",
  Italy: "IT",
  Spain: "ES",
  Brazil: "BR",
  Mexico: "MX",
  India: "IN",
  Singapore: "SG",
  Malaysia: "MY",
  Indonesia: "ID",
  Thailand: "TH",
  Vietnam: "VN",
  Philippines: "PH",
  Bangladesh: "BD",
};

export const getTikTokCountryCode = (country) => {
  if (!country) {
    return null;
  }

  const normalizedCountry = country.toLowerCase().trim();

  const matchedCountry = Object.keys(TIKTOK_COUNTRY_CODES).find(
    (key) => key.toLowerCase() === normalizedCountry,
  );

  return matchedCountry ? TIKTOK_COUNTRY_CODES[matchedCountry] : null;
};
