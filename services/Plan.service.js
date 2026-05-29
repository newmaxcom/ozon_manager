import OzonPlanSchema from "#models/ozon_plan";
import { bulkCreate } from "newmax-utils";
import moment from "moment";
import { callAdaptPlan } from "#utils/externalPlanDb";
import createGroupData from "#utils/createGroupData";
import syncPlanMpColor from "#utils/syncPlanMpColor";

class Plan {
  constructor() {
    this.schema = "plan";
  }

  setSelling = async (payload = {}, query = {}) => {
    console.log(
      "[plan/set.selling] payload:",
      JSON.stringify(payload),
      "query:",
      JSON.stringify(query)
    );
    const date = payload?.date || query?.date;
    if (!date) {
      return { status: 400, message: "date is required" };
    }

    await OzonPlanSchema.SellingModel.sync({ alter: false });

    const groupData = await createGroupData();

    const plan = await callAdaptPlan(date);
    console.log(`adaptPlan(${date}) -> ${plan.length} rows`);

    const result = {};
    const missing = [];

    plan.forEach((item) => {
      const key = String(item.fk_nom_id || "").replace("OZON", "");
      const card = groupData[key];
      if (!card) {
        missing.push(key);
        return;
      }
      const { nmid, company } = card;
      const art_group = String(item.supArt ?? "");

      const rowDate = moment(item.month).format("YYYY-MM-DD");
      const month = moment(item.month).format("DD.MM.YYYY");
      const id = `${rowDate}|${company}|${art_group}|${nmid}`;

      result[id] = {
        month,
        art_group,
        sales_qty: item.sales_qty,
        sales_amount: item.sales_amount,
        order_qty: item.order_qty,
        order_amount: item.order_amount,
        profit_amount: item.profit,
        nmid,
        company,
        date: rowDate,
      };
    });

    if (missing.length) console.log("missing keys:", missing);

    const bulk = Object.values(result);
    console.log(`[plan/set.selling] bulk rows: ${bulk.length}`);

    try {
      await bulkCreate(OzonPlanSchema.SellingModel, bulk, [
        "order_qty",
        "order_amount",
        "sales_qty",
        "sales_amount",
        "profit_amount",
      ]);
    } catch (error) {
      console.log(error);
      return { status: 500 };
    }

    // Дублируем план в technical.plan_mp_color (кабинеты без НДС, nds=false).
    // Best-effort: ошибка не должна валить основную запись в ozon_plan.selling.
    try {
      const res = await syncPlanMpColor({
        rows: bulk.map((b) => ({
          article: b.art_group,
          company: b.company,
          month: String(b.date).slice(0, 7) + "-01",
          sales_qty: b.sales_qty,
          sales_amount: b.sales_amount,
          profit_amount: b.profit_amount,
        })),
        mp: "ozon",
        fullNomMp: "oz",
      });
      console.log(`plan_mp_color[ozon]: upsert ${res.inserted}`);
    } catch (error) {
      console.log("plan_mp_color sync failed:", error);
    }

    return { status: 200, data: bulk };
  };
}

export default new Plan();
