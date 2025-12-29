import { ApiError } from '../utils/ApiError.js';

const formatZodError = (error) =>
  error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');

export const validate = (schemas) => (req, _res, next) => {
  try {
    if (schemas?.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        throw new ApiError(400, formatZodError(result.error));
      }
      req.params = result.data;
    }

    if (schemas?.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        throw new ApiError(400, formatZodError(result.error));
      }
      req.query = result.data;
    }

    if (schemas?.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        throw new ApiError(400, formatZodError(result.error));
      }
      req.body = result.data;
    }

    return next();
  } catch (err) {
    return next(err);
  }
};
