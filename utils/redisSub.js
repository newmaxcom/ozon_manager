import { subscribeToChannel } from "#core/redis";
import OnecSupplySchema from "#models/onec_supply";
import CargoService from "#services/supply/Cargo";

const { OzonQueueModel } = OnecSupplySchema;

// Подписки на события из onec-setter / UI.
export async function redisPubSub() {
  // 1С сохранил состав по коробам через onec-setter →
  // автоматически запускаем cargoes + labels.
  subscribeToChannel("ozon_compositions_saved", async (raw) => {
    let event;
    try {
      event = JSON.parse(raw);
    } catch (error) {
      console.error("[pub/sub] ozon_compositions_saved parse fail:", error.message);
      return;
    }
    console.log("[pub/sub] ozon_compositions_saved:", event);

    const { doc_number, account } = event || {};
    if (!doc_number || !account) {
      console.warn("[pub/sub] ozon_compositions_saved: пропущен doc_number/account");
      return;
    }

    try {
      const row = await OzonQueueModel.findOne({
        where: { doc_number, account },
      });
      if (!row) {
        console.warn(
          `[pub/sub] ozon_compositions_saved: queue row не найден (${doc_number}, ${account})`
        );
        return;
      }

      const cargoesResult = await CargoService.createCargoesForOrder(row);
      console.log(
        `[pub/sub] cargoes для ${doc_number}/${account}:`,
        cargoesResult
      );

      // Если грузоместа созданы — сразу делаем этикетки.
      if (cargoesResult?.cargoes?.length) {
        const labelsResult = await CargoService.createLabelsForOrder(row);
        console.log(
          `[pub/sub] labels для ${doc_number}/${account}:`,
          labelsResult
        );
      }
    } catch (error) {
      console.error(
        `[pub/sub] ozon_compositions_saved обработка упала (${doc_number}/${account}):`,
        error.message || error
      );
    }
  });
}
