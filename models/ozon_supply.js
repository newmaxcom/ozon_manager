import { DataTypes } from "sequelize";
import { sequelize } from "#core/sequelize";

const schema = "ozon_supply";

// Таблицу наполняет ozon_parser (cron 03:10) через /v3/supply-order/list + /get.
// PK (company, supply_id), при этом supply_id ХРАНИТ order.order_number — это
// исторически принятое наименование у парсера. Не путать с supply_id внутри
// SupplyOrderDetailsResponseSupply (там integer per-supply id).
const StatusModel = sequelize.define(
  "supply_status",
  {
    company: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
    supply_id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
    state: { type: DataTypes.STRING },
    status: { type: DataTypes.STRING },
    state_updated_date: { type: DataTypes.DATE },
    bundle_id: { type: DataTypes.STRING },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    schema,
    tableName: "supply_status",
    createdAt: false,
    updatedAt: "updated_at",
  }
);

const OzonSupplySchema = {
  StatusModel,
};

export default OzonSupplySchema;
