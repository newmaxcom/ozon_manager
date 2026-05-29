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

/**
 * Дублирует план продаж в technical.plan_mp_color (грейн article+color_id+month+mp).
 *
 * Грейн таблицы не содержит кабинет, поэтому каждому кабинету артикула выдаём
 * СВОЙ код цвета этого артикула (детерминированно: сортируем кабинеты и
 * свободные цвета, раздаём по индексу). Цвета, уже занятые строками nds=true,
 * исключаем из пула. Upsert защищён `WHERE nds = false`, чтобы не затирать
 * официальный план кабинетов ТЕКС-МОД / ИП Семён.
 *
 * @param {Object}   params
 * @param {Array}    params.rows       строки плана: { article, company, month:'YYYY-MM-01', sales_qty, sales_amount, profit_amount }
 * @param {string}   params.mp         значение plan_mp_color.mp ('wildberries' | 'ozon')
 * @param {string}   params.fullNomMp  значение full_nom_new.mp ('wb' | 'oz')
 */
export default async function syncPlanMpColor({ rows, mp, fullNomMp }) {
  if (!Array.isArray(rows) || !rows.length) return { inserted: 0 };

  const planRows = rows.filter(
    (r) =>
      r && r.article && r.company && r.month && !EXCLUDED_COMPANIES.has(r.company)
  );
  if (!planRows.length) return { inserted: 0 };

  const articles = [...new Set(planRows.map((r) => String(r.article)))];

  // Справочник цветов и брендов из technical.full_nom_new.
  const nomRows = await sequelize.query(
    `SELECT company, mp_article, mp_color, brand
       FROM technical.full_nom_new
      WHERE mp = :fullNomMp
        AND mp_article IN (:articles)
        AND mp_color IS NOT NULL AND mp_color <> ''`,
    { replacements: { fullNomMp, articles }, type: QueryTypes.SELECT }
  );

  const colorsByArticle = new Map(); // article -> Set(color)
  const brandByKey = new Map(); // `${company}|${article}` -> brand
  for (const r of nomRows) {
    const art = String(r.mp_article);
    if (!colorsByArticle.has(art)) colorsByArticle.set(art, new Set());
    colorsByArticle.get(art).add(String(r.mp_color));
    const k = `${r.company}|${art}`;
    if (r.brand && !brandByKey.has(k)) brandByKey.set(k, r.brand);
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
      `syncPlanMpColor[${mp}]: нет цвета в full_nom_new для ${unresolved.size} пар:`,
      [...unresolved]
    );
  }
  if (collisions) {
    console.log(
      `syncPlanMpColor[${mp}]: ${collisions} строк схлопнулись по грейну (кабинетов больше, чем цветов)`
    );
  }

  const values = [...byGrain.values()];
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
