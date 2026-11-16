/*
 * SQL চালানোর মূল অংশ। ব্রাউজারে worker (engine.worker.js) এটা importScripts দিয়ে লোড করে,
 * আর টেস্টে Node এটা require করে। তাই এটা সাধারণ JS, কোনো import নেই।
 *
 * এক টুকরো লেখায় কয়েকটা statement থাকতে পারে। প্রতিটা আলাদা চালানো হয় আর আলাদা ফল ফেরত দেয়।
 * কোনো statement-এ ভুল হলে সেখানেই থামে, তবে তার আগের statement-গুলোর ফলও ফেরত যায়
 * (সেগুলো DB-তে আসলেই চলে গেছে)।
 */
(function (root) {
  "use strict";

  function totalChanges(db) {
    return db.exec("SELECT total_changes()")[0].values[0][0];
  }

  /**
   * @param db sql.js Database
   * @param sql এক বা একাধিক statement
   * @param maxRows প্রতিটা statement-এর কতগুলো row ফেরত যাবে
   * @param countLimit এতগুলো row গোনার পর থামবে (বিশাল cross join-এ আটকে না যেতে)
   */
  function runScript(db, sql, maxRows, countLimit) {
    var statements = [];
    var current = null;
    var iterator = db.iterateStatements(sql);
    try {
      for (var stmt of iterator) {
        current = stmt.getSQL();
        var before = totalChanges(db);
        var started = Date.now();
        var rows = [];
        var total = 0;
        var capped = false;
        while (stmt.step()) {
          total++;
          if (rows.length < maxRows) rows.push(stmt.get());
          if (total >= countLimit) {
            capped = true;
            break;
          }
        }
        var columns = stmt.getColumnNames();
        var ms = Date.now() - started;
        statements.push({
          sql: current.trim(),
          columns: columns,
          rows: rows,
          total: total,
          capped: capped,
          changes: totalChanges(db) - before,
          ms: ms,
        });
        current = null;
      }
    } catch (err) {
      var failedSql = current !== null ? current : iterator.getRemainingSQL();
      return {
        statements: statements,
        error: { message: String(err && err.message ? err.message : err), sql: failedSql.trim() },
      };
    }
    return { statements: statements };
  }

  /** নতুন খালি DB-তে dataset বসিয়ে তারপর আগের পরিবর্তনগুলো আবার চালায়। */
  function loadDatabase(SQL, datasetSql, log) {
    var db = new SQL.Database();
    db.exec(datasetSql);
    var failed = 0;
    for (var i = 0; i < log.length; i++) {
      try {
        db.exec(log[i]);
      } catch {
        failed++;
      }
    }
    return { db: db, failed: failed };
  }

  var api = { runScript: runScript, loadDatabase: loadDatabase };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SqlRunner = api;
})(typeof self !== "undefined" ? self : this);
