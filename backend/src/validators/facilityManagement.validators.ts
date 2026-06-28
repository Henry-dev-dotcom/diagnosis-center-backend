import { body, param, query } from 'express-validator';

export const listFacilitiesValidator = [
  query('status').optional().isString(),
  query('type').optional().isString(),
  query('search').optional().isString(),
  query('q').optional().isString(),
  query('take').optional().isInt({ min: 1, max: 100 }),
  query('skip').optional().isInt({ min: 0 }),
];

export const facilityIdValidator = [
  param('facilityId').isString().notEmpty().withMessage('facilityId is required.'),
];

export const createFacilityValidator = [
  body('name').isString().trim().notEmpty().withMessage('Facility name is required.'),
  body('code').optional().isString().trim(),
  body('type').optional().isString().trim(),
  body('status').optional().isString().trim(),
  body('phone').optional({ nullable: true }).isString(),
  body('email').optional({ nullable: true }).isEmail().withMessage('Invalid email.'),
  body('address').optional({ nullable: true }).isString(),
  body('city').optional({ nullable: true }).isString(),
  body('region').optional({ nullable: true }).isString(),
  body('country').optional({ nullable: true }).isString(),
  body('primaryColor').optional({ nullable: true }).isString(),
  body('secondaryColor').optional({ nullable: true }).isString(),
  body('features').optional().isArray(),
  body('departments').optional().isArray(),
  body('catalog').optional().isArray(),
  body('routingRules').optional().isArray(),
  body('limits').optional().isArray(),
];

export const updateFacilityValidator = [
  ...facilityIdValidator,
  body('name').optional().isString().trim().notEmpty(),
  body('code').optional().isString().trim(),
  body('type').optional().isString().trim(),
  body('status').optional().isString().trim(),
  body('email').optional({ nullable: true }).isEmail(),
];

export const updateFacilityStatusValidator = [
  ...facilityIdValidator,
  body('status').isString().trim().notEmpty().withMessage('status is required.'),
];

export const updateFeaturesValidator = [
  ...facilityIdValidator,
  body('features').optional().isArray(),
  body().custom((value) => Array.isArray(value) || Array.isArray(value.features)).withMessage('features must be an array.'),
];

export const updateDepartmentsValidator = [
  ...facilityIdValidator,
  body('departments').optional().isArray(),
  body().custom((value) => Array.isArray(value) || Array.isArray(value.departments)).withMessage('departments must be an array.'),
];

export const updateCatalogValidator = [
  ...facilityIdValidator,
  body('catalog').optional().isArray(),
  body().custom((value) => Array.isArray(value) || Array.isArray(value.catalog)).withMessage('catalog must be an array.'),
];

export const updateRoutingRulesValidator = [
  ...facilityIdValidator,
  body('routingRules').optional().isArray(),
  body().custom((value) => Array.isArray(value) || Array.isArray(value.routingRules)).withMessage('routingRules must be an array.'),
];

export const updateBrandingValidator = [
  ...facilityIdValidator,
  body('logoName').optional({ nullable: true }).isString(),
  body('primaryColor').optional({ nullable: true }).isString(),
  body('secondaryColor').optional({ nullable: true }).isString(),
];

export const updateLimitsValidator = [
  ...facilityIdValidator,
  body('limits').optional().isArray(),
  body().custom((value) => Array.isArray(value) || Array.isArray(value.limits)).withMessage('limits must be an array.'),
];

export const assignFacilityUserValidator = [
  ...facilityIdValidator,
  body('userId').isString().notEmpty().withMessage('userId is required.'),
  body('roleKey').isString().notEmpty().withMessage('roleKey is required.'),
  body('isPrimary').optional().isBoolean(),
  body('status').optional().isString(),
];

export const removeFacilityUserValidator = [
  ...facilityIdValidator,
  param('assignmentId').isString().notEmpty().withMessage('assignmentId is required.'),
];
