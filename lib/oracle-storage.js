import { getPool } from "./storage.js";
import { AttestationError, normalizeAttestation, verifyAttestation, buildConsensus } from "./oracle.js";

export async function submitOracleReport(body) {
  const record=normalizeAttestation(body);
  if(typeof body.signature!=="string") throw new AttestationError("Missing signature");
  const db=getPool();
  const client=await db.connect();
  try {
    await client.query("BEGIN");
    const p=await client.query(
      "SELECT id,public_key_pem,sources,active FROM oracle_publishers WHERE id=$1 FOR SHARE",
      [record.publisherId]
    );
    const publisher=p.rows[0];
    if(!publisher?.active || !publisher.sources.includes(record.source)) {
      throw new AttestationError("Publisher not active or source not allowed","PUBLISHER_NOT_ALLOWED");
    }
    if(!verifyAttestation(record,body.signature,publisher.public_key_pem)) {
      throw new AttestationError("Publisher signature invalid","INVALID_SIGNATURE");
    }
    // Concurrent submissions serialize on cursor's PK update, then compare sequence.
    // The conditional upsert atomically enforces strictly increasing sequence numbers.
    const cursor=await client.query(
      "INSERT INTO oracle_publisher_cursors (publisher_id,symbol,last_sequence) VALUES($1,$2,$3) " +
      "ON CONFLICT(publisher_id,symbol) DO UPDATE SET last_sequence=EXCLUDED.last_sequence " +
      "WHERE oracle_publisher_cursors.last_sequence<EXCLUDED.last_sequence RETURNING last_sequence",
      [record.publisherId,record.symbol,record.sequence]
    );
    if(!cursor.rowCount) throw new AttestationError("Publisher sequence replayed or out of order","REPLAYED_SEQUENCE");
    const result=await client.query(
      "INSERT INTO oracle_reports(publisher_id,symbol,source,price,sequence,source_time,signature) " +
      "VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
      [record.publisherId,record.symbol,record.source,record.price,record.sequence,record.sourceTime,body.signature]
    );
    await client.query("COMMIT");
    return {id:result.rows[0].id,accepted:true,publisherId:record.publisherId,symbol:record.symbol,source:record.source,sequence:record.sequence};
  } catch(e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {client.release();}
}

export async function readOracleConsensus(symbol) {
  const db=getPool();
  // Latest per publisher, then verified in process. 30 seconds freshness enforced by buildConsensus.
  const result=await db.query(
    "SELECT DISTINCT ON(r.publisher_id) r.publisher_id::text AS \"publisherId\", " +
    "r.symbol,r.source,r.price::text AS price, r.sequence::float8 AS sequence, " +
    "to_char(r.source_time AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') AS \"sourceTime\", " +
    "r.signature,p.public_key_pem AS \"publicKey\",p.active " +
    "FROM oracle_reports r JOIN oracle_publishers p ON p.id=r.publisher_id " +
    "WHERE r.symbol=$1 AND r.source_time>now()-interval '60 seconds' " +
    "ORDER BY r.publisher_id,r.source_time DESC",
    [symbol]
  );
  // Reject if data source, publisher, signatures or current clock do not agree.
  return buildConsensus(result.rows.map(row=>({...row,price:Number(row.price)})));
}
