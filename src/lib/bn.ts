const DIGITS = "০১২৩৪৫৬৭৮৯";

/** সংখ্যাকে বাংলা অঙ্কে লেখে (১২৩৪), দশমিকসহ */
export const bn = (n: number | string): string => String(n).replace(/[0-9]/g, (d) => DIGITS[Number(d)]);
