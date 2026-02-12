import { describe, it, expect } from '@jest/globals';
import { requireTenantWriteAccess } from '../middleware/tenantAuth';

describe('tenantAuth middleware', () => {
  it('blocks viewer role from write actions', async () => {
    const request = {
      tenantId: 'tenant-1',
      authMethod: 'user',
      userRole: 'viewer',
    } as any;

    await expect(requireTenantWriteAccess(request, {} as any)).rejects.toMatchObject({
      statusCode: 403,
      code: 'READ_ONLY_ACCOUNT',
    });
  });

  it('allows member role write actions', async () => {
    const request = {
      tenantId: 'tenant-1',
      authMethod: 'user',
      userRole: 'member',
    } as any;

    await expect(requireTenantWriteAccess(request, {} as any)).resolves.toBeUndefined();
  });

  it('allows API key auth write actions', async () => {
    const request = {
      tenantId: 'tenant-1',
      authMethod: 'api_key',
      userRole: 'viewer',
    } as any;

    await expect(requireTenantWriteAccess(request, {} as any)).resolves.toBeUndefined();
  });
});
