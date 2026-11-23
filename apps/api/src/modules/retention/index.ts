// Public surface of the retention module (D33).
export { RETENTION_DAYS, purgeExpiredContent, retentionCutoff } from './retention.service';
export type { PurgeResult } from './retention.service';
export { registerRetentionJobs } from './retention.jobs';
