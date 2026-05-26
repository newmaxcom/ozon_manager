import { DataTypes } from "sequelize";
import { sequelize } from "#core/sequelize";

const schema = "onec_supply";

const OzonQueueModel = sequelize.define(
  "ozon_supplies_queue",
  {
    doc_number: { type: DataTypes.STRING, primaryKey: true },
    order_numbers: { type: DataTypes.STRING, primaryKey: true },
    account: { type: DataTypes.STRING, primaryKey: true },
    onec_prefix: { type: DataTypes.STRING },
    plan_date: { type: DataTypes.DATEONLY },
    cargo_type: { type: DataTypes.STRING, defaultValue: "BOX" },
    items: { type: DataTypes.JSONB },
    macrolocal_cluster_id: { type: DataTypes.BIGINT },
    draft_id: { type: DataTypes.BIGINT },
    storage_warehouse_id: { type: DataTypes.BIGINT },
    bundle_id: { type: DataTypes.STRING },
    timeslot_from: { type: DataTypes.STRING },
    timeslot_to: { type: DataTypes.STRING },
    order_id: { type: DataTypes.BIGINT },
    order_number: { type: DataTypes.STRING },
    supply_id: { type: DataTypes.BIGINT },
    data_filling_deadline_utc: { type: DataTypes.STRING },
    state: { type: DataTypes.STRING },
    is_error: { type: DataTypes.BOOLEAN, defaultValue: false },
    error_text: { type: DataTypes.TEXT },
    is_for_push: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    schema,
    tableName: "ozon_supplies_queue",
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

const OzonBoxesModel = sequelize.define(
  "ozon_supply_boxes",
  {
    order_id: { type: DataTypes.BIGINT, primaryKey: true },
    box_index: { type: DataTypes.INTEGER, primaryKey: true },
    box_key: { type: DataTypes.STRING },
    cargo_id: { type: DataTypes.BIGINT },
    cargo_type: { type: DataTypes.STRING, defaultValue: "BOX" },
    items: { type: DataTypes.JSONB },
    label_file_guid: { type: DataTypes.STRING },
    label_file_url: { type: DataTypes.STRING },
    ozon_status: { type: DataTypes.STRING },
  },
  {
    schema,
    tableName: "ozon_supply_boxes",
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

const OnecSupplySchema = {
  OzonQueueModel,
  OzonBoxesModel,
};

export default OnecSupplySchema;
