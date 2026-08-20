/**
 * Neo4j driver singleton.
 * Reads credentials from environment variables:
 *   NEO4J_URI      — bolt/neo4j+s connection string
 *   NEO4J_USER     — database user (default "neo4j")
 *   NEO4J_PASSWORD — database password
 */
import neo4j, { Driver, Session, type ManagedTransaction } from "neo4j-driver";
import { logger } from "./logger";

/** Hard limit per query — prevents a paused/unreachable Aura instance from
 *  hanging requests for the driver's full routing-table retry budget (~900 s).
 *  Set slightly below a typical HTTP gateway timeout (30 s) so callers always
 *  receive a meaningful error rather than a silent connection drop. */
const DB_TIMEOUT_MS = 7_000;

/** Race a Neo4j promise against a hard wall-clock timeout. */
function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `[Neo4j] ${label} timed out after ${DB_TIMEOUT_MS} ms — ` +
              "database may be paused or unreachable"
            )
          ),
        DB_TIMEOUT_MS
      )
    ),
  ]);
}

let _driver: Driver | null = null;

export function getDriver(): Driver {
  if (_driver) return _driver;

  const uri = process.env["NEO4J_URI"];
  const user = process.env["NEO4J_USER"] ?? "neo4j";
  const password = process.env["NEO4J_PASSWORD"];

  if (!uri) throw new Error("NEO4J_URI environment variable is not set");
  if (!password) throw new Error("NEO4J_PASSWORD environment variable is not set");

  _driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
    maxConnectionPoolSize: 50,
    // How long to wait for a TCP connection to the server to be established.
    // Keeps the driver from hanging indefinitely when Aura is paused.
    connectionTimeout: 5_000,
    // How long to wait to borrow a connection from the pool once one is available.
    connectionAcquisitionTimeout: 10_000,
    logging: neo4j.logging.console("warn"),
  });

  logger.info({ uri }, "Neo4j driver initialised");
  return _driver;
}

export async function closeDriver(): Promise<void> {
  if (_driver) {
    await _driver.close();
    _driver = null;
    logger.info("Neo4j driver closed");
  }
}

/** Run a query inside a read transaction and return all records.
 *  Throws if the database does not respond within DB_TIMEOUT_MS. */
export async function runRead<T>(
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  // Use NEO4J_DATABASE if set; otherwise omit to use the Aura home database
  const database = process.env["NEO4J_DATABASE"] || undefined;
  const session: Session = getDriver().session(database ? { database } : {});
  try {
    const result = await withTimeout(
      session.executeRead((tx: ManagedTransaction) => tx.run(cypher, params)),
      "runRead"
    );
    return result.records.map((r) => r.toObject() as T);
  } finally {
    await session.close().catch(() => {});
  }
}

/** Run a query inside a write transaction and return all records.
 *  Throws if the database does not respond within DB_TIMEOUT_MS. */
export async function runWrite<T>(
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  const database = process.env["NEO4J_DATABASE"] || undefined;
  const session: Session = getDriver().session(database ? { database } : {});
  try {
    const result = await withTimeout(
      session.executeWrite((tx: ManagedTransaction) => tx.run(cypher, params)),
      "runWrite"
    );
    return result.records.map((r) => r.toObject() as T);
  } finally {
    await session.close().catch(() => {});
  }
}

/** Convert a Neo4j integer (Long) to a JS number safely. */
export function toNumber(val: unknown): number {
  if (neo4j.isInt(val as any)) return (val as any).toNumber();
  return Number(val);
}
