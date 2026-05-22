import "dotenv/config";
import express from "express";
import router from "#routes/index";
import { sequelize } from "#core/index";
import flows from "#flows/index";
import { metricsMiddleware, metricsHandler } from "#utils/metrics";
import OnecSupplySchema from "#models/onec_supply";

export class App {
  constructor() {
    const PORT = process.env.OZON_MANAGER_PORT;
    const DEV_PORT = process.env.DEV_OZON_MANAGER_PORT;
    this.app = express();
    this.env = process.env.NODE_ENV || "development";
    this.port = this.env === "production" ? PORT : DEV_PORT;
    this.flows = flows;
  }

  middlewares() {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(metricsMiddleware);
  }

  routes() {
    this.app.use("/", router);
  }

  healthCheck() {
    this.app.get("/health", (_, res) => {
      res.status(200).json({
        status: "ok",
        service: "ozon-manager",
        uptime: process.uptime(),
      });
    });
  }

  metrics() {
    this.app.get("/metrics", metricsHandler);
  }

  async main() {
    await sequelize.openConnection();
    await OnecSupplySchema.OzonQueueModel.sync();
    await OnecSupplySchema.OzonBoxesModel.sync();

    this.middlewares();
    this.healthCheck();
    this.metrics();
    this.routes();
    if (this.env === "production") {
      await this.flows();
    }

    const serverInfo = `Server is running on port: ${this.port}`;
    this.app.listen(this.port, () => console.info(serverInfo));
  }
}

new App().main();
process.on("uncaughtException", async (err) => {
  console.error(err.stack);
  console.log("Node NOT Exiting...");
});
