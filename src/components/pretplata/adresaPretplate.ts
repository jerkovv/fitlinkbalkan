// Stranica za placanje je na sajtu, van /dashboard rute. Na fitlink.rs ostaje isti origin,
// pa i ista prijava; lokalno vodi na pravi sajt.
export const adresaPretplate = () =>
  typeof window !== "undefined" && /(^|\.)fitlink\.rs$/.test(window.location.hostname)
    ? "/pretplata"
    : "https://fitlink.rs/pretplata";
