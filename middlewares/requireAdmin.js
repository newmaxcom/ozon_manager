export default function requireAdmin(req, res, next) {
  if (!res.locals.user?.isAdmin) {
    return res.status(403).send({
      payload: null,
      error: {
        status: 403,
        message: "Доступ разрешён только администраторам",
      },
    });
  }

  next();
}
