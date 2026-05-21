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
      res.json({ result });
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
      const rows = await OzonQueueModel.findAll({
        order: [["created_at", "DESC"]],
        limit: 200,
      });
      res.json({ rows });
    } catch (error) {
      console.error("dashboard:", error);
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
