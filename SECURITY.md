# Security Policy

## How the app handles data

SQL Playground is a fully static site. It has no server, database, login or analytics. SQLite runs inside your browser (WebAssembly in a Web Worker). Your queries and changes stay in your own browser (`localStorage`). A share link keeps the query in the URL fragment (`#…`), which browsers never send to a server.

## Supported versions

Only the latest version on `main` (the deployed site) receives fixes.

## Reporting a vulnerability

Please report security problems privately, not in a public issue:

1. Open the repository's **Security** tab.
2. Click **Report a vulnerability**.

Please describe the issue, how to reproduce it, and its possible impact. We will reply as soon as we can.

## বাংলায়

নিরাপত্তার সমস্যা পেলে public issue না খুলে রিপোর **Security → Report a vulnerability** থেকে গোপনে জানান।
