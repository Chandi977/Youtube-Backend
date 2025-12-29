import { v4 as uuidv4 } from 'uuid';

export const requestId = (req, res, next) => {
  const incomingId =
    req.header('x-request-id') ||
    req.header('x-correlation-id') ||
    req.header('x-trace-id');

  const id = incomingId || uuidv4();
  req.id = id;
  res.setHeader('x-request-id', id);
  next();
};
