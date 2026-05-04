import { DataTypes } from "sequelize";
import { sequelize } from "#core/sequelize";

const schema = "ozon";

const CardsModel = sequelize.define(
  "ozon_cards_goods",
  {
    nmid: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
    },
    product_id: { type: DataTypes.STRING },
    vendor_code: { type: DataTypes.STRING },
    brand: { type: DataTypes.STRING },
    company: { type: DataTypes.STRING },
    category_id: { type: DataTypes.INTEGER },
    title: { type: DataTypes.STRING },
    color: { type: DataTypes.STRING },
    media: { type: DataTypes.STRING },
    is_archived: { type: DataTypes.BOOLEAN },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    schema,
    tableName: "ozon_cards_goods",
    createdAt: false,
    updatedAt: "updated_at",
  }
);

const OzonCommonSchema = {
  CardsModel,
};

export default OzonCommonSchema;
