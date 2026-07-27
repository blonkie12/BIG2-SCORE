/*
 * DEMOMODUS
 * Laat demoMode op true om de site zonder database te testen. De gegevens
 * staan dan alleen in de browser van dat apparaat.
 *
 * LIVE GEBRUIK
 * 1. Voer supabase/setup.sql uit in Supabase.
 * 2. Vul hieronder je Project URL, Publishable key en groepsslug in.
 * 3. Zet demoMode op false.
 */
window.BIG2_CONFIG = {
  demoMode: true,
  supabaseUrl: "https://JOUW-PROJECT.supabase.co",
  supabasePublishableKey: "JOUW-PUBLISHABLE-KEY",
  groupSlug: "vakantie-2026"
};
