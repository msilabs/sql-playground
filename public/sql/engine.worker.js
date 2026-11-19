/*
 * SQLite চলে এই worker-এ, যাতে লম্বা query-তে পেজ আটকে না যায়। query সময়ের মধ্যে শেষ না হলে
 * পেজ worker-টাই বন্ধ করে নতুন একটা চালায় (দেখুন global/80-client.js)।
 *
 * বার্তা:  { id, type: "load", dataset: "dokan" | "school", log }  →  { id, ok: true, failed }
 *          { id, type: "run", sql, maxRows, countLimit }  →  { id, ok: true, result }
 * ভুল হলে: { id, ok: false, error }
 */
importScripts("sql-wasm.js", "runner.js", "datasets.js");

var db = null;
// sql-wasm.wasm খোঁজা হয় এই worker ফাইলের ফোল্ডারেই
var ready = initSqlJs();

self.onmessage = function (event) {
  var msg = event.data;
  ready
    .then(function (SQL) {
      if (msg.type === "load") {
        if (db) db.close();
        var datasetSql = self.SqlDatasetSql[msg.dataset];
        if (typeof datasetSql !== "string") throw new Error("unknown dataset: " + msg.dataset);
        var loaded = self.SqlRunner.loadDatabase(SQL, datasetSql, msg.log);
        db = loaded.db;
        self.postMessage({ id: msg.id, ok: true, failed: loaded.failed });
        return;
      }
      if (msg.type === "run") {
        if (!db) throw new Error("database not loaded");
        var result = self.SqlRunner.runScript(db, msg.sql, msg.maxRows, msg.countLimit);
        self.postMessage({ id: msg.id, ok: true, result: result });
        return;
      }
      throw new Error("unknown message: " + msg.type);
    })
    .catch(function (err) {
      self.postMessage({ id: msg.id, ok: false, error: String(err && err.message ? err.message : err) });
    });
};
