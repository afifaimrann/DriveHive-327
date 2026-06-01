import { ValidationError } from '../utils/errors.js';

/**
 * Higher-order middleware function to validate Express requests with Joi.
 *
 * @param {object} schema - Joi validation schema
 * @param {string} [source='body'] - Request object property to validate ('body', 'query', 'params')
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map((d) => d.message).join(', ');
      return next(new ValidationError(details));
    }

    // Replace request data with validated/sanitized value
    req[source] = value;
    next();
  };
}

export default validate;
