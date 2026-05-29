import { QueryTypes } from "sequelize";
import { sequelize } from "#core/sequelize";
import { enumOrganization } from "../enum/inn.js";

// Кабинеты с НДС (ТЕКС-МОД / ИП Семён) уже наполняются planner-pro c nds=true.
// Их пропускаем — добавляем только остальные кабинеты как nds=false.
const EXCLUDED_COMPANIES = new Set(["TMOD", "MUNI", "SMRZ"]);
const CHUNK = 500;

// Явные касты по позициям колонок INSERT — снимают неоднозначность типов
// bind-параметров (month -> timestamp, avg_price -> bigint, nds -> boolean).
const COL_CASTS = [
  "::text", // article
  "::text", // color_id
  "::timestamp", // month
  "::text", // mp
  "::text", // qty
  "::text", // revenue
  "::bigint", // avg_price
  "::text", // profit
  "::text", // margin
  "::text", // name
  "::varchar", // brand
  "::varchar", // org
  "::boolean", // nds
];

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Текстовый формат чисел как у planner-pro (fmt_num): '0.0', '909.0', '12.5'.
const fmtNum = (v) => {
  const f = toNum(v);
  if (f === 0) return "0.0";
  const s = f.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return s.includes(".") ? s : `${s}.0`;
};

// Карточка относится к артикулу, если vendor_code начинается с артикула и
// дальше не идёт ещё одна цифра ('2161черныйF100' ✓ для '2161', но не для '216').
const vendorMatchesArticle = (vendorCode, article) => {
  if (!vendorCode.startsWith(article)) return false;
  const next = vendorCode.charAt(article.length);
  return next === "" || !/[0-9]/.test(next);
};

/**
 * Дублирует план продаж Ozon в technical.plan_mp_color (грейн article+color_id+month+mp).
 *
 * Цвет/бренд берутся из ozon.ozon_cards_goods: карточка матчится по
 * (кабинет + артикул) через vendor_code, код цвета — имя цвета карточки,
 * переведённое через technical.color_gude (color_ru -> color_id -> '0N').
 *
 * Грейн таблицы не содержит кабинет, поэтому каждому кабинету артикула выдаём
 * СВОЙ код цвета (детерминированно: сортируем кабинеты и свободные цвета,
 * раздаём по индексу). Цвета, занятые строками nds=true, исключаем из пула.
 * Upsert защищён `WHERE nds = false`, чтобы не затирать официальный план.
 *
 * @param {Object} params
 * @param {Array}  params.rows  строки плана: { article, company, month:'YYYY-MM-01', sales_qty, sales_amount, profit_amount }
 * @param {string} params.mp    значение plan_mp_color.mp ('ozon')
 */
export default async function syncPlanMpColor({ rows, mp }) {
  if (!Array.isArray(rows) || !rows.length) return { inserted: 0 };

  const planRows = rows.filter(
    (r) =>
      r && r.article && r.company && r.month && !EXCLUDED_COMPANIES.has(r.company)
  );
  console.log(
    `syncPlanMpColor[${mp}]: вход ${rows.length}, после фильтра кабинетов ${planRows.length}`
  );
  if (!planRows.length) return { inserted: 0 };

  const articles = [...new Set(planRows.map((r) => String(r.article)))];
  const companies = [...new Set(planRows.map((r) => r.company))];

  const wantedByCompany = new Map(); // company -> Set(article)
  for (const r of planRows) {
    const art = String(r.article);
    if (!wantedByCompany.has(r.company)) wantedByCompany.set(r.company, new Set());
    wantedByCompany.get(r.company).add(art);
  }

  // Карточки Ozon: бренд + код цвета (имя цвета -> color_gude.color_id -> '0N').
  // Имя цвета карточки нормализуем перед джойном: берём первый цвет из списка
  // (мультицвет "черный, белый, бежевый" / "изумрудный;черный;синий"),
  // приводим ё→е и регистр. Это поднимает покрытие color_gude с ~62% до ~93%.
  const cardRows = await sequelize.query(
    `SELECT c.company, c.vendor_code, c.brand,
            lpad(g.color_id::text, 2, '0') AS color_id
       FROM ozon.ozon_cards_goods c
       LEFT JOIN technical.color_gude g
         ON lower(g.color_ru) =
            lower(trim(split_part(translate(c.color, 'ёЁ;', 'еЕ,'), ',', 1)))
      WHERE c.company IN (:companies)
        AND c.vendor_code IS NOT NULL AND c.vendor_code <> ''`,
    { replacements: { companies }, type: QueryTypes.SELECT }
  );
  const cardsByCompany = new Map(); // company -> [{ vendor_code, brand, color_id }]
  for (const c of cardRows) {
    if (!cardsByCompany.has(c.company)) cardsByCompany.set(c.company, []);
    cardsByCompany
      .get(c.company)
      .push({ vendor_code: String(c.vendor_code), brand: c.brand, color_id: c.color_id });
  }

  // Цвета (union по всем кабинетам артикула) + бренд по (кабинет, артикул).
  const colorsByArticle = new Map(); // article -> Set(color_id)
  const brandByKey = new Map(); // `${company}|${article}` -> brand
  for (const [company, arts] of wantedByCompany) {
    const cards = cardsByCompany.get(company) || [];
    for (const art of arts) {
      const matches = cards.filter((c) => vendorMatchesArticle(c.vendor_code, art));
      if (!matches.length) continue;
      if (!colorsByArticle.has(art)) colorsByArticle.set(art, new Set());
      const set = colorsByArticle.get(art);
      for (const m of matches) if (m.color_id) set.add(m.color_id);
      const key = `${company}|${art}`;
      if (!brandByKey.has(key)) {
        const wb = matches.find((m) => m.brand);
        if (wb) brandByKey.set(key, wb.brand);
      }
    }
  }

  // Цвета, занятые официальным планом (nds=true) — их upsert не перезапишет,
  // поэтому исключаем из раздачи, чтобы новые кабинеты попадали на свободные.
  const ndsRows = await sequelize.query(
    `SELECT article, color_id
       FROM technical.plan_mp_color
      WHERE mp = :mp AND nds = TRUE AND article IN (:articles)`,
    { replacements: { mp, articles }, type: QueryTypes.SELECT }
  );
  const ndsColorsByArticle = new Map();
  for (const r of ndsRows) {
    const art = String(r.article);
    if (!ndsColorsByArticle.has(art)) ndsColorsByArticle.set(art, new Set());
    ndsColorsByArticle.get(art).add(String(r.color_id));
  }

  // Раздача "кабинет -> цвет" по каждому артикулу.
  const cabinetsByArticle = new Map(); // article -> Set(company)
  for (const r of planRows) {
    const art = String(r.article);
    if (!cabinetsByArticle.has(art)) cabinetsByArticle.set(art, new Set());
    cabinetsByArticle.get(art).add(r.company);
  }

  const colorAssign = new Map(); // `${company}|${article}` -> color
  for (const [art, cabSet] of cabinetsByArticle) {
    const all = [...(colorsByArticle.get(art) || [])].sort();
    if (!all.length) continue;
    const ndsTaken = ndsColorsByArticle.get(art) || new Set();
    let pool = all.filter((c) => !ndsTaken.has(c));
    if (!pool.length) pool = all;
    [...cabSet].sort().forEach((c, i) => {
      colorAssign.set(`${c}|${art}`, pool[Math.min(i, pool.length - 1)]);
    });
  }

  // Дедуп по грейну (last-wins): кабинеты, не уместившиеся в цвета, схлопываются.
  const byGrain = new Map();
  const unresolved = new Set();
  let collisions = 0;
  for (const r of planRows) {
    const art = String(r.article);
    const color = colorAssign.get(`${r.company}|${art}`);
    if (!color) {
      unresolved.add(`${r.company}|${art}`);
      continue;
    }
    const qty = toNum(r.sales_qty);
    const revenue = toNum(r.sales_amount);
    const profit = toNum(r.profit_amount);
    const grain = `${art}|${color}|${r.month}|${mp}`;
    if (byGrain.has(grain)) collisions += 1;
    byGrain.set(grain, [
      art,
      color,
      r.month,
      mp,
      fmtNum(qty),
      fmtNum(revenue),
      qty > 0 ? Math.round(revenue / qty) : 0,
      fmtNum(profit),
      fmtNum(revenue > 0 ? profit / revenue : 0),
      `${art}-${color}`,
      brandByKey.get(`${r.company}|${art}`) || null,
      enumOrganization[r.company] || null,
      false,
    ]);
  }

  if (unresolved.size) {
    console.log(
      `syncPlanMpColor[${mp}]: нет цвета для ${unresolved.size} пар:`,
      [...unresolved]
    );
  }
  if (collisions) {
    console.log(
      `syncPlanMpColor[${mp}]: ${collisions} строк схлопнулись по грейну (кабинетов больше, чем цветов)`
    );
  }

  const values = [...byGrain.values()];
  console.log(
    `syncPlanMpColor[${mp}]: артикулов ${articles.length}, карточек ${cardRows.length}, к upsert ${values.length}`
  );
  if (!values.length) return { inserted: 0 };

  let inserted = 0;
  for (let i = 0; i < values.length; i += CHUNK) {
    const chunk = values.slice(i, i + CHUNK);
    const bind = [];
    const tuples = chunk.map((tuple) => {
      const ph = tuple.map((val, idx) => {
        bind.push(val);
        return `$${bind.length}${COL_CASTS[idx]}`;
      });
      return `(${ph.join(", ")})`;
    });
    await sequelize.query(
      `INSERT INTO technical.plan_mp_color
         (article, color_id, month, mp, qty, revenue, avg_price,
          profit, margin, name, brand, org, nds)
       VALUES ${tuples.join(", ")}
       ON CONFLICT (article, color_id, month, mp) DO UPDATE
         SET qty       = EXCLUDED.qty,
             revenue   = EXCLUDED.revenue,
             avg_price = EXCLUDED.avg_price,
             profit    = EXCLUDED.profit,
             margin    = EXCLUDED.margin,
             name      = EXCLUDED.name,
             brand     = EXCLUDED.brand,
             org       = EXCLUDED.org,
             nds       = EXCLUDED.nds
       WHERE technical.plan_mp_color.nds = FALSE`,
      { bind, type: QueryTypes.INSERT }
    );
    inserted += chunk.length;
  }

  return { inserted };
}
