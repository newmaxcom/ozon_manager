import { Sequelize } from "sequelize";
import config from "#configs/db";

const env = process.env.NODE_ENV || "development";
const dbConfig = config[env];

const sequelizeConfig = {
  ...dbConfig,
  timezone: "+03:00",
  dialectOptions: {
    useUTC: false,
  },
  pool: {
    max: 8,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  retry: {
    match: [/Deadlock/i, Sequelize.ConnectionError, Sequelize.TimeoutError],
    max: 3,
    backoffBase: 3000,
    backoffExponent: 1.5,
  },
  logging: (msg, timing) => {
    if (process.env.NODE_ENV === "development") {
      console.log(`[${timing}ms] ${msg}`);
    }
  },
};

export const sequelize = new Sequelize(sequelizeConfig);

async function openConnection() {
  try {
    await sequelize.authenticate();
    console.log(
      `Соединение с базой данных установлено. PORT: ${dbConfig.port}`
    );
  } catch (error) {
    console.error("Ошибка соединения с базой данных:", error);
  }
}

async function closeConnection() {
  return await sequelize.close();
}

export default { openConnection, closeConnection };
