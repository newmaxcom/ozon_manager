import { DataTypes } from "sequelize";
import { sequelize } from "#core/sequelize";

const schema = "ozon_report";

// Read-only зеркало таблицы, которую ведёт ozon_parser (Report.service.setInvoices).
const InvoicesModel = sequelize.define(
  "invoices",
  {
    company: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
    },
    id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      primaryKey: true,
    },
    amount: { type: DataTypes.DECIMAL(18, 2) },
    currency: { type: DataTypes.STRING },
    state: { type: DataTypes.STRING },
    status: { type: DataTypes.STRING },
    schedule_payment_date: { type: DataTypes.DATE },
    payment_date: { type: DataTypes.DATE },
    payment_number: { type: DataTypes.STRING },
    payment_method: { type: DataTypes.STRING },
    is_factoring: { type: DataTypes.BOOLEAN },
    period_from: { type: DataTypes.DATEONLY },
    period_to: { type: DataTypes.DATEONLY },
    doc_type: { type: DataTypes.STRING },
    doc_type_sys_name: { type: DataTypes.STRING },
    delay_in_days: { type: DataTypes.INTEGER },
    has_defer: { type: DataTypes.BOOLEAN },
    updated_at: { type: DataTypes.DATE },
  },
  {
    schema,
    tableName: "invoices",
    createdAt: false,
    updatedAt: "updated_at",
  }
);

const OzonReportSchema = {
  InvoicesModel,
};

export default OzonReportSchema;
