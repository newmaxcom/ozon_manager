import jwt from "jsonwebtoken";

const accessSecret = process.env.OZON_JWT_SECRET || "ozon-client-access-secret";
const accessExpiresIn = process.env.OZON_JWT_EXPIRES_IN || "24h";

export default function generateTokens(payload) {
  return {
    accessToken: jwt.sign(payload, accessSecret, {
      expiresIn: accessExpiresIn,
    }),
  };
}
