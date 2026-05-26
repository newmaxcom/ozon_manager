import DraftService from "#services/supply/Draft";
import BookingService from "#services/supply/Booking";
import SupplyOrderService from "#services/supply/SupplyOrder";
import CargoService from "#services/supply/Cargo";
import PassService from "#services/supply/Pass";
import OnecSupplySchema from "#models/onec_supply";

const { OzonQueueModel, OzonBoxesModel } = OnecSupplySchema;

class SupplyController {
  createDrafts = async (req, res) => {
    try {
      const result = await DraftService.createDrafts();
      res.json({ result });
    } catch (error) {
      console.error("createDrafts:", error);
      res.status(500).json({ error: error.message || String(error) });
    }
  };

  draftInfo = async (req, res) => {
    try {
      const { account, draft_id } = req.query;
      if (!account || !draft_id) {
        return res.status(400).json({ error: "account и draft_id обязательны" });
      }
      const data = await DraftService.getDraftInfo(account, draft_id);
      res.json(data);
    } catch (error) {
      console.error("draftInfo:", error);
      res.status(500).json({ error: error.message || String(error) });
    }
  };

  timeslots = async (req, res) => {
    try {
      const data = await BookingService.getTimeslots(req.body);
      res.json(data);
    } catch (error) {
      console.error("timeslots:", error);
      res.status(500).json({ error: error.message || String(error) });
    }
  };

  createSupplies = async (req, res) => {
    try {
      const result = await SupplyOrderService.createSupplies(req.body || {});
      res.json({ result });
    } catch (error) {
      console.error("createSupplies:", error);
      res.status(500).json({ error: error.message || String(error) });
    }
  };

  refreshStatuses = async (req, res) => {
    try {
      const result = await SupplyOrderService.refreshStatuses();
      res.json(result);
    } catch (error) {
      console.error("refreshStatuses:", error);
      res.status(500).json({ error: error.message || String(error) });
    }
  };

  createCargoes = async (req, res) => {
    try {
      const result = await CargoService.createCargoes();
      res.json({ result });
    } catch (error) {
      console.error("createCargoes:", error);
      res.status(500).json({ error: error.message || String(error) });
    }
  };

  createLabels = async (req, res) => {
    try {
      const result = await CargoService.createLabels();
      res.json({ result });
    } catch (error) {
      console.error("createLabels:", error);
      res.status(500).json({ error: error.message || String(error) });
    }
  };

  labelFile = async (req, res) => {
    try {
      const { account, file_guid } = req.query;
      if (!account || !file_guid) {
        return res
          .status(400)
          .json({ error: "account и file_guid обязательны" });
      }
      const buf = await CargoService.fetchLabelFile(account, file_guid);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="labels-${file_guid}.pdf"`
      );
      res.send(Buffer.from(buf));
    } catch (error) {
      console.error("labelFile:", error);
      res.status(500).json({ error: error.message || String(error) });
    }
  };

  setPass = async (req, res) => {
    try {
      const result = await PassService.setPass(req.body || {});
      res.json(result);
    } catch (error) {
      console.error("setPass:", error);
      res.status(500).json({ error: error.message || String(error) });
    }
  };

  dashboard = async (req, res) => {
    try {
      const rows = await SupplyOrderService.getDashboardRows();
      res.json({ rows });
    } catch (error) {
      console.error("dashboard:", error);
      res.status(500).json({ error: error.message || String(error) });
    }
  };

  // Сохраняет ручной выбор склада/таймслота для строки очереди (до
  // создания заявки). createSupplyForRow подхватит эти значения вместо
  // auto-select.
  selectSlot = async (req, res) => {
    try {
      const {
        doc_number,
        order_numbers,
        account,
        macrolocal_cluster_id,
        storage_warehouse_id,
        bundle_id,
        timeslot_from,
        timeslot_to,
      } = req.body || {};
      if (!doc_number || !order_numbers || !account) {
        return res
          .status(400)
          .json({ error: "doc_number, order_numbers, account обязательны" });
      }
      const row = await OzonQueueModel.findOne({
        where: { doc_number, order_numbers, account },
      });
      if (!row) return res.status(404).json({ error: "Строка не найдена" });
      if (row.order_id) {
        return res
          .status(409)
          .json({ error: "Заявка уже создана, слот менять нужно через timeslot.update" });
      }
      await row.update({
        macrolocal_cluster_id:
          macrolocal_cluster_id ?? row.macrolocal_cluster_id,
        storage_warehouse_id:
          storage_warehouse_id ?? row.storage_warehouse_id,
        bundle_id: bundle_id ?? row.bundle_id,
        timeslot_from: timeslot_from ?? row.timeslot_from,
        timeslot_to: timeslot_to ?? row.timeslot_to,
      });
      res.json({ ok: true, row: row.toJSON() });
    } catch (error) {
      console.error("selectSlot:", error);
      res.status(500).json({ error: error.message || String(error) });
    }
  };

  cancelOrder = async (req, res) => {
    try {
      const { doc_number, order_numbers, account } = req.body || {};
      if (!doc_number || !order_numbers || !account) {
        return res
          .status(400)
          .json({ error: "doc_number, order_numbers, account обязательны" });
      }
      const row = await OzonQueueModel.findOne({
        where: { doc_number, order_numbers, account },
      });
      if (!row) return res.status(404).json({ error: "Строка не найдена" });
      const result = await SupplyOrderService.cancelOrder(row);
      res.json(result);
    } catch (error) {
      console.error("cancelOrder:", error);
      res.status(500).json({ error: error.message || String(error) });
    }
  };

  forceRefresh = async (req, res) => {
    try {
      const { doc_number, order_numbers, account } = req.body || {};
      if (!doc_number || !order_numbers || !account) {
        return res
          .status(400)
          .json({ error: "doc_number, order_numbers, account обязательны" });
      }
      const row = await OzonQueueModel.findOne({
        where: { doc_number, order_numbers, account },
      });
      if (!row) return res.status(404).json({ error: "Строка не найдена" });
      const data = await SupplyOrderService.forceRefreshRow(row);
      res.json({ ok: true, state: data?.state, data });
    } catch (error) {
      console.error("forceRefresh:", error);
      res.status(500).json({ error: error.message || String(error) });
    }
  };

  statuses = async (req, res) => {
    try {
      const limit = Number(req.query.limit) || 500;
      const rows = await SupplyOrderService.getAllSupplyStatuses({ limit });
      res.json({ rows });
    } catch (error) {
      console.error("statuses:", error);
      res.status(500).json({ error: error.message || String(error) });
    }
  };

  boxes = async (req, res) => {
    try {
      const { order_id } = req.query;
      if (!order_id)
        return res.status(400).json({ error: "order_id обязателен" });
      const rows = await OzonBoxesModel.findAll({
        where: { order_id },
        order: [["box_index", "ASC"]],
      });
      res.json({ rows });
    } catch (error) {
      console.error("boxes:", error);
      res.status(500).json({ error: error.message || String(error) });
    }
  };
}

export default new SupplyController();
