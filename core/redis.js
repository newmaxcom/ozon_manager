import { Redis } from "ioredis";

const port = parseInt(process.env.REDIS_PORT, 10) || 6379;
const host = process.env.REDIS_HOST;

const redisConfig = {
  host,
  port,
  db: 13,
};

// Отдельный клиент-публикатор (то же DB 13, что у onec-setter и wber_manager).
const redisPublisher = new Redis(redisConfig);

// Клиент DB 3 — там ozon_parser кэширует составы поставок:
// ключ `ozon_supply/goods/{account}` → { id, supplies: { [supply_id]: [{barcode, acceptedQuantity, nmid}] } }
export const redisParserCache = new Redis({ host, port, db: 3 });

export async function publishEvent(channel, event) {
  try {
    await redisPublisher.publish(channel, JSON.stringify(event));
  } catch (error) {
    console.error(`publishEvent ${channel} failed:`, error.message);
  }
}

let pubSubClient = null;
let connectingPromise = null;

async function getPubSubClient() {
  if (pubSubClient && pubSubClient.status === "ready") {
    return pubSubClient;
  }
  if (
    pubSubClient &&
    (pubSubClient.status === "connecting" ||
      pubSubClient.status === "reconnecting")
  ) {
    if (connectingPromise) {
      try {
        return await connectingPromise;
      } catch {
        // продолжим создавать заново
      }
    }
  }
  if (pubSubClient) {
    try {
      await pubSubClient.quit();
    } catch {
      // ignore
    }
    pubSubClient = null;
  }

  connectingPromise = new Promise((resolve, reject) => {
    pubSubClient = new Redis({
      ...redisConfig,
      enableReadyCheck: false,
      autoResubscribe: false,
      lazyConnect: true,
    });
    pubSubClient.on("connect", () => {
      console.log(`Redis Pub/Sub connected. ${host}:${port} db=13`);
    });
    pubSubClient.on("ready", () => resolve(pubSubClient));
    pubSubClient.on("error", (error) => {
      console.error("Redis Pub/Sub error:", error.message);
    });
    pubSubClient.on("end", () => {
      pubSubClient = null;
    });
    pubSubClient.connect().catch(reject);
  });

  try {
    const client = await connectingPromise;
    connectingPromise = null;
    return client;
  } catch (error) {
    connectingPromise = null;
    throw error;
  }
}

export async function subscribeToChannel(channel, callback) {
  const client = await getPubSubClient();
  client.on("message", (channelName, message) => {
    if (channelName === channel) callback(message);
  });
  await client.subscribe(channel);
  console.log(`Subscribed to Redis channel "${channel}"`);
}
