import { dispatcherClient } from "#utils/dispatcherClient";
import {
  openDoc,
  replaceRows,
  appendRows,
  spreadsheetUrl,
} from "#utils/brandMonitorSheets";
import {
  BRAND_MONITOR_CONFIG,
  buildBrandPageUrl,
  buildSearchUrl,
} from "#configs/brandMonitor";

const HEADERS_CARDS = [
  "Дата",
  "Бренд",
  "Категория",
  "sku",
  "Название",
  "Бренд карточки",
  "Бейдж Оригинал",
  "Цена",
  "Старая цена",
  "Скидка",
  "Рейтинг",
  "Отзывы",
  "sellerId",
  "sellerName",
  "Источник",
  "Найден по",
  "Ссылка",
];

const HEADERS_SUMMARY = [
  "sellerId",
  "Продавец",
  "Всего карточек",
  "SUSPICIOUS_NO_BADGE",
  "NAMING_PARASITE",
  "Ссылка на магазин",
];

const HEADERS_HISTORY = [...HEADERS_CARDS, "run_id"];

const HEADERS_LOG = [
  "Время",
  "Бренд",
  "Источник",
  "Шаг",
  "Получено",
  "Всего",
  "totalPages",
  "skuId",
  "url",
  "Ошибка",
];

class BrandMonitor {
  constructor() {
    this.schema = "brand-monitor";
  }

  run = async ({ brand: brandFilter } = {}) => {
    const runId = new Date().toISOString();
    const brands = brandFilter
      ? BRAND_MONITOR_CONFIG.BRANDS.filter((b) => b.name === brandFilter)
      : BRAND_MONITOR_CONFIG.BRANDS;

    if (!brands.length) {
      return { status: 400, message: `Unknown brand: ${brandFilter}` };
    }

    const perBrand = [];
    const allCards = [];
    const allLog = [];

    for (const brand of brands) {
      try {
        const result = await this._scanBrand(brand);
        perBrand.push({
          brand: brand.name,
          totalCards: result.totalCards,
          ownCount: result.counts?.own ?? 0,
          suspiciousCount: result.counts?.suspicious ?? 0,
          parasiteCount: result.counts?.parasite ?? 0,
          pdpFailed: result.pdpEnrichment?.failed ?? 0,
          sellerKeysSeen: result.pdpEnrichment?.sellerKeysSeen ?? [],
        });
        for (const card of result.cards || []) {
          allCards.push({ ...card, _brand: brand.name });
        }
        for (const entry of result.log || []) {
          allLog.push({ ...entry, brand: brand.name });
        }
      } catch (e) {
        console.error(`scanBrand(${brand.name}) failed:`, e.message);
        perBrand.push({ brand: brand.name, error: e.message });
        allLog.push({
          ts: new Date().toISOString(),
          brand: brand.name,
          source: "orchestrator",
          step: "scan_failed",
          error: e.message,
        });
      }
    }

    try {
      await this._writeSheets({ runId, allCards, allLog });
    } catch (e) {
      console.error("writeSheets failed:", e.message);
      return {
        status: 502,
        runId,
        perBrand,
        error: `sheets write failed: ${e.message}`,
        spreadsheetUrl: spreadsheetUrl(BRAND_MONITOR_CONFIG.SPREADSHEET_ID),
      };
    }

    return {
      status: 200,
      runId,
      perBrand,
      spreadsheetUrl: spreadsheetUrl(BRAND_MONITOR_CONFIG.SPREADSHEET_ID),
    };
  };

  _scanBrand = async (brand) => {
    const url = `/gologin/${BRAND_MONITOR_CONFIG.CABINET}/ozon/brand-monitor/scan`;
    const urls = { search: buildSearchUrl(brand) };
    const brandPage = buildBrandPageUrl(brand);
    if (brandPage) urls.brandPage = brandPage;

    const body = {
      brand: {
        name: brand.name,
        brandId: brand.brandId,
        keywords: brand.keywords,
      },
      urls,
      ownSellerIds: BRAND_MONITOR_CONFIG.OWN_SELLER_IDS,
      maxPdp: BRAND_MONITOR_CONFIG.MAX_PDP_PER_BRAND,
    };
    const { data } = await dispatcherClient.post(url, body);
    return data;
  };

  _flattenCard = (c, date) => ({
    "Дата": date,
    "Бренд": c._brand,
    "Категория": c.category,
    "sku": c.skuId,
    "Название": c.name,
    "Бренд карточки": c.brand,
    "Бейдж Оригинал": c.isOriginalBadge ? "да" : "",
    "Цена": c.priceCurrent ?? "",
    "Старая цена": c.priceOriginal ?? "",
    "Скидка": c.discount ?? "",
    "Рейтинг": c.rating ?? "",
    "Отзывы": c.feedbacks ?? "",
    "sellerId": c.sellerId ?? "",
    "sellerName": c.sellerName ?? "",
    "Источник": c.source,
    "Найден по": c.matchedKeyword,
    "Ссылка": c.link
      ? c.link.startsWith("http")
        ? c.link
        : `https://www.ozon.ru${c.link}`
      : "",
  });

  _sellerSummary = (parasites) => {
    const map = new Map();
    for (const c of parasites) {
      if (c.sellerId == null) continue;
      const key = c.sellerId;
      if (!map.has(key)) {
        map.set(key, {
          sellerId: c.sellerId,
          sellerName: c.sellerName || "",
          sellerLink: c.sellerLink || "",
          total: 0,
          suspicious: 0,
          parasite: 0,
        });
      }
      const r = map.get(key);
      r.total++;
      if (c.category === "SUSPICIOUS_NO_BADGE") r.suspicious++;
      if (c.category === "NAMING_PARASITE") r.parasite++;
    }
    return [...map.values()].map((r) => ({
      "sellerId": r.sellerId,
      "Продавец": r.sellerName,
      "Всего карточек": r.total,
      "SUSPICIOUS_NO_BADGE": r.suspicious,
      "NAMING_PARASITE": r.parasite,
      "Ссылка на магазин": r.sellerLink
        ? r.sellerLink.startsWith("http")
          ? r.sellerLink
          : `https://www.ozon.ru${r.sellerLink}`
        : "",
    }));
  };

  _writeSheets = async ({ runId, allCards, allLog }) => {
    const doc = await openDoc(BRAND_MONITOR_CONFIG.SPREADSHEET_ID);
    const date = new Date().toISOString();

    const own = allCards.filter((c) => c.category === "OWN_BRAND_OFFICIAL");
    const parasites = allCards.filter(
      (c) =>
        c.category === "SUSPICIOUS_NO_BADGE" ||
        c.category === "NAMING_PARASITE"
    );

    await replaceRows(
      doc,
      "Ozon — свои",
      HEADERS_CARDS,
      own.map((c) => this._flattenCard(c, date))
    );
    await replaceRows(
      doc,
      "Ozon — паразиты",
      HEADERS_CARDS,
      parasites.map((c) => this._flattenCard(c, date))
    );
    await replaceRows(
      doc,
      "Ozon — сводка по продавцам",
      HEADERS_SUMMARY,
      this._sellerSummary(parasites)
    );
    await appendRows(
      doc,
      "Ozon — история",
      HEADERS_HISTORY,
      parasites.map((c) => ({ ...this._flattenCard(c, date), "run_id": runId }))
    );
    await replaceRows(
      doc,
      "Ozon — лог",
      HEADERS_LOG,
      allLog.map((l) => ({
        "Время": l.ts || "",
        "Бренд": l.brand || "",
        "Источник": l.source || "",
        "Шаг": l.step || "",
        "Получено": l.got ?? "",
        "Всего": l.total ?? "",
        "totalPages": l.totalPages ?? "",
        "skuId": l.skuId || "",
        "url": l.url || "",
        "Ошибка": l.error || "",
      }))
    );
  };
}

export default new BrandMonitor();
