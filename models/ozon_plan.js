import { DataTypes } from "sequelize";
import { sequelize } from "#core/sequelize";

const schema = "ozon_plan";

const SellingModel = sequelize.define(
  "selling",
  {
    month: { type: DataTypes.STRING },
    art_group: { type: DataTypes.STRING, allowNull: false, primaryKey: true },
    sales_qty: { type: DataTypes.REAL, defaultValue: 0 },
    sales_amount: { type: DataTypes.REAL, defaultValue: 0 },
    order_qty: { type: DataTypes.REAL, defaultValue: 0 },
    order_amount: { type: DataTypes.REAL, defaultValue: 0 },
    profit_amount: { type: DataTypes.REAL, defaultValue: 0 },
    nmid: { type: DataTypes.STRING, allowNull: false, primaryKey: true },
    company: { type: DataTypes.STRING, allowNull: false, primaryKey: true },
    date: { type: DataTypes.DATE, allowNull: false, primaryKey: true },
  },
  {
    schema,
    tableName: "selling",
    createdAt: false,
    updatedAt: false,
  }
);

const OzonPlanSchema = {
  SellingModel,
};

export default OzonPlanSchema;
