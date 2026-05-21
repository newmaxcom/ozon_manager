import { DataTypes } from "sequelize";
import { sequelize } from "#core/sequelize";

const schema = "private";

const OzonAccountModel = sequelize.define(
  "ozon_accounts",
  {
    id: { type: DataTypes.STRING, primaryKey: true },
    client_id: { type: DataTypes.STRING },
    apikey: { type: DataTypes.STRING },
    cookie: { type: DataTypes.STRING },
    go_login_id: { type: DataTypes.STRING },
  },
  {
    schema,
    tableName: "ozon_accounts",
    createdAt: false,
    updatedAt: false,
  }
);

const PrivateSchema = {
  OzonAccountModel,
};

export default PrivateSchema;
