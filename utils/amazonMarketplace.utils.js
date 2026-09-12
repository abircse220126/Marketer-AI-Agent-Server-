// const amazonMarketplaces = {
//   "united states": {
//     domain: "amazon.com",
//     countryCode: "US",
//   },

//   usa: {
//     domain: "amazon.com",
//     countryCode: "US",
//   },

//   "united kingdom": {
//     domain: "amazon.co.uk",
//     countryCode: "UK",
//   },

//   uk: {
//     domain: "amazon.co.uk",
//     countryCode: "UK",
//   },

//   canada: {
//     domain: "amazon.ca",
//     countryCode: "CA",
//   },

//   germany: {
//     domain: "amazon.de",
//     countryCode: "DE",
//   },

//   france: {
//     domain: "amazon.fr",
//     countryCode: "FR",
//   },

//   italy: {
//     domain: "amazon.it",
//     countryCode: "IT",
//   },

//   spain: {
//     domain: "amazon.es",
//     countryCode: "ES",
//   },

//   india: {
//     domain: "amazon.in",
//     countryCode: "IN",
//   },

//   japan: {
//     domain: "amazon.co.jp",
//     countryCode: "JP",
//   },
// };

// export const getAmazonMarketplace = (country) => {
//   if (!country) {
//     return null;
//   }

//   return amazonMarketplaces[country.trim().toLowerCase()] || null;
// };


const AMAZON_MARKETPLACES = {
  "united states": {
    countryCode: "US",
    domain: "amazon.com",
  },

  "united kingdom": {
    countryCode: "GB",
    domain: "amazon.co.uk",
  },

  canada: {
    countryCode: "CA",
    domain: "amazon.ca",
  },

  germany: {
    countryCode: "DE",
    domain: "amazon.de",
  },

  france: {
    countryCode: "FR",
    domain: "amazon.fr",
  },

  italy: {
    countryCode: "IT",
    domain: "amazon.it",
  },

  spain: {
    countryCode: "ES",
    domain: "amazon.es",
  },

  japan: {
    countryCode: "JP",
    domain: "amazon.co.jp",
  },

  india: {
    countryCode: "IN",
    domain: "amazon.in",
  },

  australia: {
    countryCode: "AU",
    domain: "amazon.com.au",
  },
};


export const getAmazonMarketplace = (
  country
) => {

  if (!country) {
    return null;
  }

  const normalizedCountry =
    country
      .toLowerCase()
      .trim();

  return (
    AMAZON_MARKETPLACES[
      normalizedCountry
    ] || null
  );
};