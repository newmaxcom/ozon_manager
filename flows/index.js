import cron from "node-cron";
import InvoicesService from "#services/Invoices";

// Расписание ozon_manager. Запускается из index.js только в production.
async function flows() {
  // 04:30 — выгрузка ozon_report.invoices в Google Sheet.
  // Парсер пишет таблицу в 04:00 (см. ozon_parser/flows/index.js → "invoices"),
  // 30 минут — запас на завершение пагинации по всем кабинетам.
  cron.schedule(
    "30 4 * * *",
    async () => {
      try {
        console.info("[flows] invoices.pushToSheet started");
        const result = await InvoicesService.pushToSheet();
        console.info(
          `[flows] invoices.pushToSheet done: ${JSON.stringify(result)}`
        );
      } catch (error) {
        console.error("[flows] invoices.pushToSheet failed:", error);
      }
    },
    { timezone: "Europe/Moscow" }
  );

  console.info("[flows] schedules registered");
}

export default flows;
