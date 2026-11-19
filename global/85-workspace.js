// query চালানোর সাধারণ অংশ, Playground, Challenge আর পাঠের বাক্স সবাই এটা ব্যবহার করে:
// চালানো, ভুলের বাংলা বার্তা, ব্যাখ্যা, আর SELECT হলে বাস্তবে যেভাবে চলে, যুক্তির ধাপ ও JOIN-এর ছবি।
(function () {
    if (typeof document === 'undefined') return;
    var Db = window.SqlDb;
    var T = window.SqlTokenize;
    var Errors = window.SqlErrors;
    var explainStatement = window.SqlExplain.explainStatement;
    var Stages = window.SqlStages;
    var Trace = window.SqlTrace;
    var Join = window.SqlJoin;
    var splitSelect = window.SqlSplit.splitSelect;
    var mutationsOf = window.SqlSession.mutationsOf;

    // ভুলের বার্তায় দেখানোর জন্য বাকি লেখার প্রথম statement
    var firstStatement = function (sql) { var s = T.splitStatements(sql)[0]; return s ? s.text : sql; };

    // এবারের চালানোয় শেষ যে statement row দিয়েছে
    var lastWithRows = function (result) { return [...result.statements].reverse().find(function (s) { return s.columns.length > 0; }) || null; };

    /**
     * চালায় আর দেখানোর মতো ফল বানায়। ফল:
     * { ok: false, output } যখন worker থেমে গেছে (সময় শেষ বা ভেঙেছে); তখন DB আবার load করতে হবে।
     * { ok: true, result, output, changedDb, schema } বাকি সব সময় (SQL-এর ভুলও এখানে, output.error-এ)।
     */
    async function execute(engine, text, schema) {
        var result;
        try {
            result = await engine.run(text);
        } catch (e) {
            var timeout = e instanceof Db.TimeoutError;
            var friendly = timeout ? Errors.TIMEOUT_ERROR : Errors.friendlyError(e instanceof Error ? e.message : String(e), schema);
            return { ok: false, output: { statements: [], error: { sql: '', message: timeout ? '' : String(e), friendly: friendly } } };
        }
        var changedDb = mutationsOf(result).length > 0;
        var current = schema;
        if (changedDb) {
            try {
                current = await Db.loadSchema(engine);
            } catch (e) {
                // schema না এলেও ফল দেখাই
            }
        }
        var last = result.statements[result.statements.length - 1];
        var output = {
            statements: result.statements,
            error: result.error ? { sql: firstStatement(result.error.sql), message: result.error.message, friendly: Errors.friendlyError(result.error.message, current) } : undefined,
            explanation: last && !result.error ? explainStatement(last.sql, last) : undefined
        };
        return { ok: true, result: result, output: output, changedDb: changedDb, schema: current };
    }

    // শেষ statement-এর ধাপ আর (JOIN থাকলে) তার ছবি; দেখানোর মতো কিছু না থাকলে null
    async function analyze(engine, result) {
        var last = result.statements[result.statements.length - 1];
        if (result.error || !last) return null;
        var stages = await Stages.runStages(engine, last.sql);
        var trace = await Trace.runTrace(engine, last.sql);
        if (T.statementKind(last.sql) !== 'select') return { stages: stages, trace: trace, join: null, hasJoin: false };
        var split = splitSelect(last.sql);
        var hasJoin = split.ok && split.query.from !== undefined && Join.parseJoin(split.query.from) !== null;
        var join = hasJoin ? await Join.buildJoinView(engine, last.sql) : null;
        return { stages: stages, trace: trace, join: join, hasJoin: hasJoin };
    }

    window.SqlWorkspace = { execute: execute, analyze: analyze, lastWithRows: lastWithRows };
})();
