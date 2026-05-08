// Google Sheet, в который выгружаем выплаты Ozon после ежедневного парсинга
// (ozon_parser → ozon_report.invoices).
export const INVOICES_CONFIG = {
  SPREADSHEET_ID: "1aiyNv_fTDJh1reYsz-qAC8TuvOeBqtUb1-ljBO4xRBU",
  SHEET_TITLE: "Выплаты",
};

// docTypeSysName → Тип выплаты (берём как в LK Ozon).
export const PAYMENT_TYPE_LABELS = {
  PaymentForSaleOfGoods: "Оплата реализации",
  DocumentMarketplaceSellerCompensationByTypeDoc: "Выплата по товарным компенсациям",
  Buyout: "Оплата выкупов маркетплейсом",
};

// status → Статус выплаты в формате LK.
export const STATUS_LABELS = {
  WaitingForPayment: "Ожидает выплаты",
  Paid: "Выплачена",
};
