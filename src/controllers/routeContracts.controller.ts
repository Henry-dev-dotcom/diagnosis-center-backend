import type { Request, Response } from 'express';
import type { Phase6RouteContract } from '../config/phase6RouteMap.js';
import { PHASE6_ROUTE_CONTRACTS } from '../config/phase6RouteMap.js';
import { sendSuccess } from '../utils/apiResponse.js';

function groupContractsByModule(contracts: Phase6RouteContract[]) {
  return contracts.reduce<Record<string, Phase6RouteContract[]>>((groups, contract) => {
    groups[contract.module] ??= [];
    groups[contract.module].push(contract);
    return groups;
  }, {});
}

export function getRouteContracts(req: Request, res: Response) {
  const includeAliases = req.query.includeAliases !== 'false';
  const contracts = includeAliases ? PHASE6_ROUTE_CONTRACTS : PHASE6_ROUTE_CONTRACTS.filter((contract) => !contract.frontendAlias);

  return sendSuccess(res, 'Phase 6 route contracts', {
    phase: 6,
    total: contracts.length,
    implemented: contracts.filter((contract) => contract.status === 'implemented').length,
    placeholders: contracts.filter((contract) => contract.status === 'contract-placeholder').length,
    frontendAliases: contracts.filter((contract) => contract.frontendAlias).length,
    routes: contracts,
    grouped: groupContractsByModule(contracts)
  });
}
