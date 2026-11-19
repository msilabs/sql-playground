/**
 * ছোট SQL tokenizer (SQLite-এর নিয়মে)। highlight, autocomplete, statement ভাগ আর
 * visualizer-এর clause ভাগ, সবাই এটা ব্যবহার করে। পুরো parser নয়; শুধু টুকরোগুলো চেনে।
 */
(function (root) {
    /** SQLite-এর keyword (https://sqlite.org/lang_keywords.html) */
    const KEYWORDS = new Set(("ABORT ACTION ADD AFTER ALL ALTER ALWAYS ANALYZE AND AS ASC ATTACH AUTOINCREMENT BEFORE BEGIN BETWEEN BY " +
        "CASCADE CASE CAST CHECK COLLATE COLUMN COMMIT CONFLICT CONSTRAINT CREATE CROSS CURRENT CURRENT_DATE " +
        "CURRENT_TIME CURRENT_TIMESTAMP DATABASE DEFAULT DEFERRABLE DEFERRED DELETE DESC DETACH DISTINCT DO DROP " +
        "EACH ELSE END ESCAPE EXCEPT EXCLUDE EXCLUSIVE EXISTS EXPLAIN FAIL FILTER FIRST FOLLOWING FOR FOREIGN FROM " +
        "FULL GENERATED GLOB GROUP GROUPS HAVING IF IGNORE IMMEDIATE IN INDEX INDEXED INITIALLY INNER INSERT INSTEAD " +
        "INTERSECT INTO IS ISNULL JOIN KEY LAST LEFT LIKE LIMIT MATCH MATERIALIZED NATURAL NO NOT NOTHING NOTNULL " +
        "NULL NULLS OF OFFSET ON OR ORDER OTHERS OUTER OVER PARTITION PLAN PRAGMA PRECEDING PRIMARY QUERY RAISE " +
        "RANGE RECURSIVE REFERENCES REGEXP REINDEX RELEASE RENAME REPLACE RESTRICT RETURNING RIGHT ROLLBACK ROW ROWS " +
        "SAVEPOINT SELECT SET TABLE TEMP TEMPORARY THEN TIES TO TRANSACTION TRIGGER UNBOUNDED UNION UNIQUE UPDATE " +
        "USING VACUUM VALUES VIEW VIRTUAL WHEN WHERE WINDOW WITH WITHOUT").split(" "));
    const OPERATORS = ["||", "<<", ">>", "<=", ">=", "==", "!=", "<>", "->>", "->", "<", ">", "=", "+", "-", "*", "/", "%", "&", "|", "~"];
    const isIdentStart = (ch) => /[\p{L}_]/u.test(ch);
    const isIdentPart = (ch) => /[\p{L}\p{N}\p{M}_$]/u.test(ch);
    const isDigit = (ch) => ch >= "0" && ch <= "9";
    function tokenize(sql) {
        const tokens = [];
        let i = 0;
        const push = (type, end) => {
            const text = sql.slice(i, end);
            tokens.push({ type, text, start: i, end, upper: text.toUpperCase() });
            i = end;
        };
        /** `close` চিহ্ন পর্যন্ত (দুইবার লিখলে চিহ্নটা লেখার অংশ, যেমন 'it''s') */
        const quoted = (close) => {
            let j = i + 1;
            while (j < sql.length) {
                if (sql[j] === close) {
                    if (sql[j + 1] === close && close !== "]")
                        j += 2;
                    else
                        return j + 1;
                }
                else
                    j++;
            }
            return sql.length;
        };
        while (i < sql.length) {
            const ch = sql[i];
            const next = sql[i + 1];
            if (/\s/.test(ch)) {
                let j = i + 1;
                while (j < sql.length && /\s/.test(sql[j]))
                    j++;
                push("ws", j);
            }
            else if (ch === "-" && next === "-") {
                const j = sql.indexOf("\n", i);
                push("comment", j === -1 ? sql.length : j);
            }
            else if (ch === "/" && next === "*") {
                const j = sql.indexOf("*/", i + 2);
                push("comment", j === -1 ? sql.length : j + 2);
            }
            else if (ch === "'") {
                push("string", quoted("'"));
            }
            else if (ch === '"' || ch === "`") {
                push("quoted", quoted(ch));
            }
            else if (ch === "[") {
                push("quoted", quoted("]"));
            }
            else if (isDigit(ch) || (ch === "." && next !== undefined && isDigit(next))) {
                let j = i;
                if (ch === "0" && (next === "x" || next === "X")) {
                    j += 2;
                    while (j < sql.length && /[0-9a-fA-F_]/.test(sql[j]))
                        j++;
                }
                else {
                    while (j < sql.length && (isDigit(sql[j]) || sql[j] === "_"))
                        j++;
                    if (sql[j] === ".") {
                        j++;
                        while (j < sql.length && isDigit(sql[j]))
                            j++;
                    }
                    if ((sql[j] === "e" || sql[j] === "E") && /[0-9+-]/.test(sql[j + 1] ?? "")) {
                        j += 2;
                        while (j < sql.length && isDigit(sql[j]))
                            j++;
                    }
                }
                push("number", j);
            }
            else if (isIdentStart(ch)) {
                let j = i + 1;
                while (j < sql.length && isIdentPart(sql[j]))
                    j++;
                const upper = sql.slice(i, j).toUpperCase();
                push(KEYWORDS.has(upper) ? "keyword" : "ident", j);
            }
            else if (ch === "?" || ch === ":" || ch === "@" || (ch === "$" && next !== undefined && isIdentStart(next))) {
                let j = i + 1;
                while (j < sql.length && isIdentPart(sql[j]))
                    j++;
                push("param", j);
            }
            else if ("(),;.".includes(ch)) {
                push("punct", i + 1);
            }
            else {
                const op = OPERATORS.find((o) => sql.startsWith(o, i));
                push(op ? "op" : "unknown", i + (op ? op.length : 1));
            }
        }
        return tokens;
    }
    /** ফাঁকা জায়গা আর comment বাদে */
    const significant = (tokens) => tokens.filter((t) => t.type !== "ws" && t.type !== "comment");
    const isKeyword = (t, ...words) => t !== undefined && t.type === "keyword" && words.includes(t.upper);
    /** identifier-এর আসল নাম ("x", `x`, [x] থেকে x) */
    function identName(t) {
        if (t.type !== "quoted")
            return t.text;
        const inner = t.text.slice(1, -1);
        const q = t.text[0];
        return q === "[" ? inner : inner.split(q + q).join(q);
    }
    const isNameToken = (t) => t !== undefined && (t.type === "ident" || t.type === "quoted");
    /**
     * লেখাকে `;` দেখে statement-এ ভাগ করে (string আর comment-এর ভেতরের `;` বাদে)।
     * CREATE TRIGGER-এর BEGIN … END-এর ভেতরের `;`-এ ভাগ করে না। ফাঁকা statement বাদ যায়।
     */
    function splitStatements(sql) {
        const tokens = tokenize(sql);
        const spans = [];
        let start = 0;
        let firstWords = [];
        let inTriggerBody = false;
        const close = (end) => {
            const text = sql.slice(start, end).trim();
            if (text && significant(tokenize(text)).some((t) => t.text !== ";")) {
                const offset = sql.indexOf(text, start);
                spans.push({ text, start: offset, end: offset + text.length });
            }
            start = end;
            firstWords = [];
            inTriggerBody = false;
        };
        for (const t of tokens) {
            if (t.type === "ws" || t.type === "comment")
                continue;
            if (firstWords.length < 3)
                firstWords.push(t.upper);
            const isTrigger = firstWords[0] === "CREATE" && (firstWords[1] === "TRIGGER" || firstWords[2] === "TRIGGER");
            if (isTrigger && t.upper === "BEGIN")
                inTriggerBody = true;
            if (inTriggerBody && t.upper === "END")
                inTriggerBody = false;
            if (t.text === ";" && t.type === "punct" && !inTriggerBody)
                close(t.end);
        }
        close(sql.length);
        return spans;
    }
    /** statement কোন ধরনের। WITH থাকলে তার পরের মূল কাজটা দেখে। */
    function statementKind(sql) {
        const tokens = significant(tokenize(sql));
        const first = tokens[0];
        if (!first)
            return "other";
        let word = first.upper;
        if (word === "WITH") {
            let depth = 0;
            word = "OTHER";
            for (const t of tokens.slice(1)) {
                if (t.text === "(")
                    depth++;
                else if (t.text === ")")
                    depth--;
                else if (depth === 0 && isKeyword(t, "SELECT", "VALUES", "INSERT", "UPDATE", "DELETE", "REPLACE")) {
                    word = t.upper;
                    break;
                }
            }
        }
        switch (word) {
            case "SELECT":
            case "VALUES":
                return "select";
            case "INSERT":
            case "REPLACE":
                return "insert";
            case "UPDATE":
                return "update";
            case "DELETE":
                return "delete";
            case "CREATE":
                return "create";
            case "DROP":
                return "drop";
            case "ALTER":
                return "alter";
            case "PRAGMA":
                return "pragma";
            case "BEGIN":
            case "COMMIT":
            case "END":
            case "ROLLBACK":
            case "SAVEPOINT":
            case "RELEASE":
                return "transaction";
            case "EXPLAIN":
                return "explain";
            default:
                return "other";
        }
    }
    /** DB বদলায় না এমন statement (এগুলো সেভের log-এ রাখার দরকার নেই) */
    function isReadOnly(sql) {
        const kind = statementKind(sql);
        if (kind === "select" || kind === "explain")
            return true;
        if (kind === "pragma")
            return !significant(tokenize(sql)).some((t) => t.text === "=");
        return false;
    }

    var api = { KEYWORDS: KEYWORDS, tokenize: tokenize, significant: significant, isKeyword: isKeyword, identName: identName, isNameToken: isNameToken, splitStatements: splitStatements, statementKind: statementKind, isReadOnly: isReadOnly };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.SqlTokenize = api;
})(typeof self !== 'undefined' ? self : this);
