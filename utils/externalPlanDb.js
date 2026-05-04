import mysql from "mysql2/promise";

let pool = null;

function getPool() {
  if (pool) return pool;

  pool = mysql.createPool({
    host: process.env.OZON_PLAN_DB_HOST,
    port: Number(process.env.OZON_PLAN_DB_PORT) || 3306,
    user: process.env.OZON_PLAN_DB_USER,
    password: process.env.OZON_PLAN_DB_PASSWORD,
    database: process.env.OZON_PLAN_DB_NAME,
    waitForConnections: true,
    connectionLimit: 4,
    queueLimit: 0,
  });

  return pool;
}

export async function callAdaptPlan(date) {
  const [resultSets] = await getPool().query("CALL adaptPlan(?)", [date]);
  return resultSets[0] || [];
}
