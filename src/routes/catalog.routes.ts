import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import { adminCatalogQuerySchema } from '../validators/admin.validators.js';
import { listCatalogController } from '../controllers/adminBusiness.controller.js';

/*
  Read-only catalog access for every authenticated role. The price/test catalog
  is reference data that clinicians, reception, lab and scan all need to place
  and process orders; only creating and editing items stays admin-gated under
  /admin/catalog.
*/
export const catalogRoutes = Router();
catalogRoutes.use('/catalog', requireAuth);
catalogRoutes.get('/catalog', validateRequest({ query: adminCatalogQuerySchema }), listCatalogController);
