export default function validateMiddleware(schema) {
  return async (req, res, next) => {
    try {
      await schema.validateAsync(req.body);
      next();
    } catch (error) {
      return res.status(400).send({ statusCode: 400, message: error.message });
    }
  };
}
