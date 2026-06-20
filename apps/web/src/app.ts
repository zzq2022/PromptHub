// Trigger hot-reload to clear rate limits and load new env configs
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { FolderDB, PromptDB, SkillDB } from '@prompthub/db';
import rootPackage from '../../../package.json';
import { getServerDatabase } from './database.js';
import { logger } from './middleware/logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { auth as authMiddleware } from './middleware/auth.js';
import { securityHeaders } from './middleware/security-headers.js';
import authRoutes from './routes/auth.js';
import promptRoutes from './routes/prompts.js';
import folderRoutes from './routes/folders.js';
import skillRoutes from './routes/skills.js';
import rulesRoutes from './routes/rules.js';
import settingsRoutes from './routes/settings.js';
import aiRoutes from './routes/ai.js';
import mediaRoutes from './routes/media.js';
import syncRoutes from './routes/sync.js';
import importExportRoutes from './routes/import-export.js';
import devicesRoutes from './routes/devices.js';
import skillhubPublicRoutes, { skillhubPrivateRoutes } from './routes/skillhub-routes.js';
import adminRoutes from './routes/admin-routes.js';
import { bootstrapPromptWorkspace } from './services/prompt-workspace.js';
import { bootstrapRuleWorkspace } from './services/rule-workspace.js';
import { bootstrapSkillWorkspace } from './services/skill-workspace.js';

export function createApp(): Hono {
  const db = getServerDatabase();
  bootstrapPromptWorkspace(db, new PromptDB(db), new FolderDB(db));
  bootstrapSkillWorkspace(db, new SkillDB(db));
  bootstrapRuleWorkspace();

  const app = new Hono();

  app.use('*', logger());
  app.use('*', cors({
    origin: (origin) => origin || '*',
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Content-Disposition'],
  }));
  app.use('*', securityHeaders());
  app.onError(errorHandler);

  app.route('/api/auth', authRoutes);
  app.route('/api/skillhub', skillhubPublicRoutes);

  const protectedApi = new Hono();
  protectedApi.use('*', authMiddleware());
  protectedApi.route('/prompts', promptRoutes);
  protectedApi.route('/folders', folderRoutes);
  protectedApi.route('/skills', skillRoutes);
  protectedApi.route('/rules', rulesRoutes);
  protectedApi.route('/settings', settingsRoutes);
  protectedApi.route('/ai', aiRoutes);
  protectedApi.route('/media', mediaRoutes);
  protectedApi.route('/sync', syncRoutes);
  protectedApi.route('/devices', devicesRoutes);
  protectedApi.route('/', importExportRoutes);
  protectedApi.route('/skillhub', skillhubPrivateRoutes);
  protectedApi.route('/admin', adminRoutes);

  app.route('/api', protectedApi);

  app.get('/health', (c) => c.json({ status: 'ok', version: process.env.APP_VERSION || rootPackage.version }));

  return app;
}
