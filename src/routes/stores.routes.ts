import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { requireAuth, requireAnyPermission, requirePermission } from '../middleware/auth.js';
import { requireModule } from '../middleware/requireModule.js';
import { validateRequest } from '../middleware/validate.js';
import { idParamSchema } from '../validators/common.validators.js';
import {
  adjustSchema,
  cancelSchema,
  issueSchema,
  itemQuerySchema,
  itemSchema,
  poQuerySchema,
  purchaseOrderSchema,
  receiveSchema,
  requisitionQuerySchema,
  requisitionSchema,
  supplierSchema,
  updateItemSchema,
  updateSupplierSchema
} from '../validators/stores.validators.js';
import * as c from '../controllers/stores.controller.js';

const P = PERMISSIONS;

// Any facility role may ask the store for items; the store office manages stock and procurement.
export const storesRoutes = Router();
storesRoutes.use('/stores', requireAuth, requireModule('stores'));
storesRoutes.get('/stores/summary', requirePermission(P.STORES_READ), c.summaryController);
storesRoutes.get('/stores/suppliers', requireAnyPermission(P.STORES_READ, P.STORES_ORDER), c.listSuppliersController);
storesRoutes.post('/stores/suppliers', requirePermission(P.STORES_MANAGE), validateRequest({ body: supplierSchema }), c.createSupplierController);
storesRoutes.patch('/stores/suppliers/:id', requirePermission(P.STORES_MANAGE), validateRequest({ params: idParamSchema, body: updateSupplierSchema }), c.updateSupplierController);
// Requesters need the item list to ask for things.
storesRoutes.get('/stores/items', requireAnyPermission(P.STORES_READ, P.STORES_REQUEST), validateRequest({ query: itemQuerySchema }), c.listItemsController);
storesRoutes.post('/stores/items', requirePermission(P.STORES_MANAGE), validateRequest({ body: itemSchema }), c.createItemController);
storesRoutes.get('/stores/items/:id', requirePermission(P.STORES_READ), validateRequest({ params: idParamSchema }), c.getItemController);
storesRoutes.patch('/stores/items/:id', requirePermission(P.STORES_MANAGE), validateRequest({ params: idParamSchema, body: updateItemSchema }), c.updateItemController);
storesRoutes.post('/stores/items/:id/adjust', requirePermission(P.STORES_MANAGE), validateRequest({ params: idParamSchema, body: adjustSchema }), c.adjustController);
storesRoutes.get('/stores/purchase-orders', requireAnyPermission(P.STORES_READ, P.STORES_APPROVE), validateRequest({ query: poQuerySchema }), c.listPosController);
storesRoutes.post('/stores/purchase-orders', requirePermission(P.STORES_ORDER), validateRequest({ body: purchaseOrderSchema }), c.createPoController);
storesRoutes.get('/stores/purchase-orders/:id', requireAnyPermission(P.STORES_READ, P.STORES_APPROVE), validateRequest({ params: idParamSchema }), c.getPoController);
storesRoutes.post('/stores/purchase-orders/:id/approve', requirePermission(P.STORES_APPROVE), validateRequest({ params: idParamSchema }), c.approvePoController);
storesRoutes.post('/stores/purchase-orders/:id/cancel', requireAnyPermission(P.STORES_ORDER, P.STORES_APPROVE), validateRequest({ params: idParamSchema, body: cancelSchema }), c.cancelPoController);
storesRoutes.post('/stores/purchase-orders/:id/receive', requirePermission(P.STORES_RECEIVE), validateRequest({ params: idParamSchema, body: receiveSchema }), c.receiveController);
storesRoutes.get('/stores/requisitions', requireAnyPermission(P.STORES_REQUEST, P.STORES_ISSUE), validateRequest({ query: requisitionQuerySchema }), c.listRequisitionsController);
storesRoutes.post('/stores/requisitions', requirePermission(P.STORES_REQUEST), validateRequest({ body: requisitionSchema }), c.createRequisitionController);
storesRoutes.get('/stores/requisitions/:id', requireAnyPermission(P.STORES_REQUEST, P.STORES_ISSUE), validateRequest({ params: idParamSchema }), c.getRequisitionController);
storesRoutes.post('/stores/requisitions/:id/issue', requirePermission(P.STORES_ISSUE), validateRequest({ params: idParamSchema, body: issueSchema }), c.issueController);
storesRoutes.post('/stores/requisitions/:id/reject', requirePermission(P.STORES_ISSUE), validateRequest({ params: idParamSchema, body: cancelSchema }), c.rejectController);
