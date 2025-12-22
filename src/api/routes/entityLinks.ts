import { FastifyInstance } from 'fastify';
import { EntityLinksController } from '../controllers/entityLinksController';

export async function registerEntityLinksRoutes(server: FastifyInstance) {
  const controller = new EntityLinksController(server);

  // Get entity links (with filters)
  server.get('/api/entity-links', async (request, reply) => {
    return controller.getEntityLinks(request, reply);
  });

  // Get link proposals (pending review)
  server.get('/api/entity-links/proposals', async (request, reply) => {
    return controller.getProposals(request, reply);
  });

  // Update link status (approve/reject)
  server.patch('/api/entity-links/:linkId', async (request, reply) => {
    return controller.updateLinkStatus(request, reply);
  });

  // Bulk approve/reject
  server.post('/api/entity-links/bulk-update', async (request, reply) => {
    return controller.bulkUpdate(request, reply);
  });

  // Get entity aliases
  server.get('/api/entities/:nodeId/aliases', async (request, reply) => {
    return controller.getEntityAliases(request, reply);
  });
}
