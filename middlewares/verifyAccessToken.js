import jwt from "jsonwebtoken";

const accessSecret = process.env.OZON_JWT_SECRET || "ozon-client-access-secret";

export default function verifyAccessToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({
      payload: null,
      error: {
        status: 401,
        message: "Требуется авторизация",
      },
    });
  }

  const accessToken = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(accessToken, accessSecret);
    res.locals.user = decoded.user;
    next();
  } catch (error) {
    return res.status(401).send({
      payload: null,
      error: {
        status: 401,
        message: "Сессия истекла или токен недействителен",
      },
    });
  }
}
