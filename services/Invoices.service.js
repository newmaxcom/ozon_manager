import OzonReportSchema from "#models/ozon_report";
import { openDoc, replaceRows, spreadsheetUrl } from "#utils/brandMonitorSheets";
import {
  INVOICES_CONFIG,
  PAYMENT_TYPE_LABELS,
  STATUS_LABELS,
} from "#configs/invoices";
import { enumOrganization } from "../enum/inn.js";

const HEADERS = [
  "Организация",
  "Тип выплаты",
  "Сумма",
  "Статус выплаты",
  "Планируемая дата выплаты",
  "Дата отправки выплаты",
  "Период",
  "Номер документа оплаты",
];

const formatDate = (value) => {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
};

const formatPeriod = (from, to) => {
  const f = formatDate(from);
  const t = formatDate(to);
  if (f && t) return `${f} – ${t}`;
  return f || t || "";
};

const formatAmount = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  return num.toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatPaymentDoc = (paymentNumber, paymentDate) => {
  if (!paymentNumber) return "—";
  const date = formatDate(paymentDate);
  return date ? `№${paymentNumber} от ${date}` : `№${paymentNumber}`;
};

class Invoices {
  constructor() {
    this.schema = "invoices";
  }

  // Тянет все выплаты из ozon_report.invoices, формирует таблицу как в ЛК Ozon
  // и переписывает первый лист SPREADSHEET_ID.
  pushToSheet = async () => {
    const rows = await OzonReportSchema.InvoicesModel.findAll({
      order: [
        ["schedule_payment_date", "DESC"],
        ["company", "ASC"],
      ],
    });

    if (!rows.length) {
      return {
        status: 200,
        message: "Нет данных в ozon_report.invoices",
        count: 0,
      };
    }

    const sheetRows = rows.map((row) => {
      const r = row.dataValues;
      return {
        "Организация": enumOrganization[r.company] || r.company,
        "Тип выплаты":
          PAYMENT_TYPE_LABELS[r.doc_type_sys_name] ||
          PAYMENT_TYPE_LABELS[r.doc_type] ||
          r.doc_type_sys_name ||
          r.doc_type ||
          "",
        "Сумма": formatAmount(r.amount),
        "Статус выплаты": STATUS_LABELS[r.status] || r.state || r.status || "",
        "Планируемая дата выплаты": formatDate(r.schedule_payment_date),
        "Дата отправки выплаты": formatDate(r.payment_date) || "—",
        "Период": formatPeriod(r.period_from, r.period_to),
        "Номер документа оплаты": formatPaymentDoc(
          r.payment_number,
          r.payment_date
        ),
      };
    });

    try {
      const doc = await openDoc(INVOICES_CONFIG.SPREADSHEET_ID);
      await replaceRows(doc, INVOICES_CONFIG.SHEET_TITLE, HEADERS, sheetRows);
    } catch (error) {
      console.error("invoices push failed:", error);
      return {
        status: 502,
        message: `sheets write failed: ${error.message}`,
      };
    }

    return {
      status: 200,
      count: sheetRows.length,
      spreadsheetUrl: spreadsheetUrl(INVOICES_CONFIG.SPREADSHEET_ID),
    };
  };
}

export default new Invoices();
