import type { Role } from '../types';

let authenticatedRole: Role | null = null;

export const getAuthenticatedRole = () => authenticatedRole;

export const setAuthenticatedRole = (role: Role | null) => {
  authenticatedRole = role;
};
