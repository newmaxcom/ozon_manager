import cron from "node-cron";
import InvoicesService from "#services/Invoices";
import DraftService from "#services/supply/Draft";
import SupplyOrderService from "#services/supply/SupplyOrder";
import CargoService from "#services/supply/Cargo";

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

  // Каждые 10 минут — создание черновиков для новых строк очереди.
  cron.schedule(
    "*/10 * * * *",
    async () => {
      try {
        const result = await DraftService.createDrafts();
        if (result.length) {
          const ok = result.filter((r) => r.ok).length;
          console.info(`[flows] supply.createDrafts: ${ok}/${result.length} ok`);
        }
      } catch (error) {
        console.error("[flows] supply.createDrafts failed:", error.message);
      }
    },
    { timezone: "Europe/Moscow" }
  );

  // Каждые 15 минут — догоняем черновики до заявок (если данные подъехали).
  cron.schedule(
    "5,20,35,50 * * * *",
    async () => {
      try {
        const result = await SupplyOrderService.createSupplies();
        if (result.length) {
          const ok = result.filter((r) => r.ok).length;
          console.info(`[flows] supply.createSupplies: ${ok}/${result.length} ok`);
        }
      } catch (error) {
        console.error("[flows] supply.createSupplies failed:", error.message);
      }
    },
    { timezone: "Europe/Moscow" }
  );

  // Каждые 20 минут — догоняем грузоместа и этикетки (на случай, если
  // pub/sub-handler не отработал или 1С перепередала состав).
  cron.schedule(
    "*/20 * * * *",
    async () => {
      try {
        const cargoes = await CargoService.createCargoes();
        if (cargoes.length) {
          const ok = cargoes.filter((r) => r.ok).length;
          console.info(
            `[flows] supply.createCargoes: ${ok}/${cargoes.length} ok`
          );
        }
        const labels = await CargoService.createLabels();
        if (labels.length) {
          const okL = labels.filter((r) => r.ok).length;
          console.info(
            `[flows] supply.createLabels: ${okL}/${labels.length} ok`
          );
        }
      } catch (error) {
        console.error(
          "[flows] supply.createCargoes/labels failed:",
          error.message
        );
      }
    },
    { timezone: "Europe/Moscow" }
  );

  // Каждые 30 минут — триггер парсера, чтобы supply_status был свежим.
  cron.schedule(
    "*/30 * * * *",
    async () => {
      try {
        const result = await SupplyOrderService.refreshStatuses();
        console.info(`[flows] supply.refreshStatuses:`, result);
      } catch (error) {
        console.error("[flows] supply.refreshStatuses failed:", error.message);
      }
    },
    { timezone: "Europe/Moscow" }
  );

  console.info("[flows] schedules registered");
}

export default flows;
