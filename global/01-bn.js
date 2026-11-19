(function (root) {
    const DIGITS = "০১২৩৪৫৬৭৮৯";
    /** সংখ্যাকে বাংলা অঙ্কে লেখে (১২৩৪), দশমিকসহ */
    const bn = (n) => String(n).replace(/[0-9]/g, (d) => DIGITS[Number(d)]);

    var api = { bn: bn };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.SqlBn = api;
})(typeof self !== 'undefined' ? self : this);
