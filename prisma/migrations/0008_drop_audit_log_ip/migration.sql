-- Dropa a coluna audit_log.ip_address — declarada no schema desde o baseline mas
-- nunca populada (todos os auditLog.create setam só userAgent). Reduz schema drift
-- vs runtime. Reverte-se com uma migration ADD COLUMN se captura de IP for desejada.

ALTER TABLE "audit_log" DROP COLUMN IF EXISTS "ip_address";
