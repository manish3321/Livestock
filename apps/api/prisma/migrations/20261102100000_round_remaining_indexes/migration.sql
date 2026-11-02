-- Remaining/today milking filter: farmId + type + session + entryDate
CREATE INDEX IF NOT EXISTS "ProductionEntry_farmId_type_session_entryDate_idx"
  ON "ProductionEntry" ("farmId", "type", "session", "entryDate");

-- Non-milking remaining filters ScanEvent by roundId
CREATE INDEX IF NOT EXISTS "ScanEvent_roundId_idx"
  ON "ScanEvent" ("roundId");