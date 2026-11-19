// ব্রাউজারের Engine: SQLite চলে public/sql/engine.worker.js-এ।
//
// কোনো কাজ সময়ের বেশি নিলে worker বন্ধ করে দেওয়া হয় (WASM-এর ভেতরের লুপ অন্যভাবে থামানো যায় না)
// আর TimeoutError ছোড়া হয়। পরের `load` নতুন worker চালু করে।
(function () {
    if (typeof document === 'undefined') return;
    var Db = window.SqlDb;

    var TIMEOUT_MS = 3000;
    // প্রথমবার WASM লোডসহ একটু বেশি সময় লাগতে পারে
    var LOAD_TIMEOUT_MS = 15000;
    // নতুন deploy-এর পর পুরোনো worker cache থেকে না আসার জন্য
    var WORKER_VERSION = '2';
    var base = document.documentElement.dataset.base || '/';

    class WorkerEngine {
        constructor() {
            this.worker = null;
            this.nextId = 1;
            this.pending = new Map();
        }

        ensureWorker() {
            if (this.worker) return this.worker;
            var worker = new Worker(base + 'sql/engine.worker.js?v=' + WORKER_VERSION);
            worker.onmessage = (event) => {
                var reply = event.data;
                var entry = this.pending.get(reply.id);
                if (!entry) return;
                this.pending.delete(reply.id);
                clearTimeout(entry.timer);
                if (reply.ok) entry.resolve(reply.result ?? reply.failed ?? null);
                else entry.reject(new Error(reply.error));
            };
            worker.onerror = (event) => {
                event.preventDefault();
                this.kill(new Error(event.message || 'worker error'));
            };
            this.worker = worker;
            return worker;
        }

        // worker বন্ধ করে, অপেক্ষায় থাকা সব কাজ বাতিল করে
        kill(error) {
            if (this.worker) this.worker.terminate();
            this.worker = null;
            for (var entry of this.pending.values()) {
                clearTimeout(entry.timer);
                entry.reject(error);
            }
            this.pending.clear();
        }

        send(message, timeout) {
            var worker = this.ensureWorker();
            var id = this.nextId++;
            return new Promise((resolve, reject) => {
                var timer = setTimeout(() => this.kill(new Db.TimeoutError()), timeout);
                this.pending.set(id, { resolve: resolve, reject: reject, timer: timer });
                worker.postMessage(Object.assign({}, message, { id: id }));
            });
        }

        async load(dataset, log) {
            await this.send({ type: 'load', dataset: dataset, log: [...log] }, LOAD_TIMEOUT_MS);
        }

        run(sql, options) {
            options = options || {};
            return this.send({
                type: 'run',
                sql: sql,
                maxRows: options.maxRows ?? Db.USER_MAX_ROWS,
                countLimit: options.countLimit ?? Db.COUNT_LIMIT
            }, TIMEOUT_MS);
        }

        dispose() {
            this.kill(new Error('disposed'));
        }
    }

    window.SqlClient = { WorkerEngine: WorkerEngine };
})();
