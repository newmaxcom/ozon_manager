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

// adaptPlan на каждый вызов делает drop+create ОБЩИХ таблиц
// (plan_seller_colormodel / plan_unique_seller_colormodel), поэтому два
// одновременных CALL гонятся: один дропает таблицу, пока другой её читает
// в финальном SELECT -> ER_NO_SUCH_TABLE. Сериализуем вызовы через MySQL
// named lock GET_LOCK на одном соединении (работает и между процессами).
export async function callAdaptPlan(date) {
  const conn = await getPool().getConnection();
  try {
    await conn.query("SELECT GET_LOCK('adaptPlan', 60)");
    const [resultSets] = await conn.query("CALL adaptPlan(?)", [date]);
    return resultSets[0] || [];
  } finally {
    try {
      await conn.query("SELECT RELEASE_LOCK('adaptPlan')");
    } catch {
      // лок снимется сам при закрытии соединения — игнорируем
    }
    conn.release();
  }
}
