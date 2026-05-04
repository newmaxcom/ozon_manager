import OzonPlanSchema from "#models/ozon_plan";
import { bulkCreate } from "newmax-utils";
import moment from "moment";
import { callAdaptPlan } from "#utils/externalPlanDb";
import createGroupData from "#utils/createGroupData";

class Plan {
  constructor() {
    this.schema = "plan";
  }

  setSelling = async ({ date }) => {
    if (!date) {
      return { status: 400, message: "date is required" };
    }

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

    return { status: 200, data: bulk };
  };
}

export default new Plan();
