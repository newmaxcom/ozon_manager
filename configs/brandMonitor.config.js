export const BRAND_MONITOR_CONFIG = {
  DISPATCHER_URL:
    process.env.GOLOGIN_DISPATCHER_URL || "http://dispatcher:41000",
  CABINET: "DOLG",
  SPREADSHEET_ID: "1OC1s8aAazT-GclmunxoGdJgETLxQUhS9F5sTCQcP8d0",
  OWN_SELLER_IDS: [2310737],
  MAX_PDP_PER_BRAND: 100,
  REQUEST_TIMEOUT_MS: 9 * 60 * 1000,
  BRANDS: [
    {
      name: "OIRO",
      brandId: 101241165,
      slug: "oiro",
      keywords: ["oiro", "оиро"],
      categorySlug: "zhenskaya-odezhda-7501",
    },
  ],
};

export function buildBrandPageUrl(brand) {
  const params = new URLSearchParams({
    brand_was_predicted: "true",
    category_was_predicted: "true",
    deny_category_prediction: "true",
    from_global: "true",
    text: brand.slug,
  });
  return `https://www.ozon.ru/category/${brand.categorySlug}/${brand.slug}-${brand.brandId}/?${params.toString()}`;
}

export function buildSearchUrl(brand) {
  const params = new URLSearchParams({
    from_global: "true",
    text: brand.slug,
  });
  return `https://www.ozon.ru/search/?${params.toString()}`;
}

export default BRAND_MONITOR_CONFIG;
