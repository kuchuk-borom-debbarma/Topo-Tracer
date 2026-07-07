//NOTE: UUID Collision safety for generating uuid on client and not letting db do it
//NOTE: Clockskew needs to be handled
//NOTE: Use 2-Phase Commit (Postgres outbox state machine + S3) for simple, crash-resilient ingestion
//NOTE: Use Saga pattern for Tenant Signup/Provisioning (and Trace Deletion) to handle cross-system transaction failures
