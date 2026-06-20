import type { Request } from 'express';

type SortOrder = 'asc' | 'desc';

export type PaginationInput = {
  page?: number | string;
  limit?: number | string;
  search?: string;
  sortBy?: string;
  sortOrder?: SortOrder;
};

export function getPagination(query: PaginationInput) {
  const page = Math.max(Number(query.page ?? 1), 1);
  const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);
  const sortOrder: SortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit,
    search: typeof query.search === 'string' ? query.search.trim() : undefined,
    sortBy: query.sortBy,
    sortOrder
  };
}

export function paginationMeta(total: number, page: number, limit: number) {
  return {
    total,
    page,
    limit,
    totalPages: Math.max(Math.ceil(total / limit), 1),
    hasNextPage: page * limit < total,
    hasPreviousPage: page > 1
  };
}

export function safeOrderBy<TAllowed extends string>(sortBy: string | undefined, sortOrder: SortOrder, allowedFields: readonly TAllowed[], fallback: TAllowed) {
  const field = sortBy && allowedFields.includes(sortBy as TAllowed) ? (sortBy as TAllowed) : fallback;
  return { [field]: sortOrder } as Record<TAllowed, SortOrder>;
}

export function getActorId(req: Request) {
  return req.user?.id ?? null;
}
