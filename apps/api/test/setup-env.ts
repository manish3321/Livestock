import { resetEnvCache } from '../src/config/env';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-1234';
process.env.ACCESS_TOKEN_TTL_SEC = '900';
process.env.REFRESH_TOKEN_TTL_DAYS = '30';
process.env.STORAGE_DRIVER = 'local';

resetEnvCache();
