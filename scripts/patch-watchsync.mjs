#!/usr/bin/env node
/**
 * Vraca WatchSyncPlugin u packageClassList u generisanom iOS Capacitor configu.
 *
 * Zasto: WatchSyncPlugin zivi direktno u App targetu (ios/App/App/), NIJE npm
 * paket pod plugins/, pa ga `cap sync` ne pronalazi i svaki put izbacuje iz
 * packageClassList. Bez te liste Capacitor ne registruje plugin → JS pozivi
 * (sendTokenToWatch / confirmLoggedIn / clearWatchToken) bacaju UNIMPLEMENTED i
 * pairing token nikad ne stigne na Watch.
 *
 * Ova skripta se pokrece POSLE `cap sync` (videti npm "cap:ios"). Idempotentna:
 * ne duplira unos ako vec postoji.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(
  __dirname,
  "..",
  "ios",
  "App",
  "App",
  "capacitor.config.json",
);
const PLUGIN_CLASS = "WatchSyncPlugin";

function main() {
  let raw;
  try {
    raw = readFileSync(CONFIG_PATH, "utf8");
  } catch (e) {
    console.error(
      `[patch-watchsync] Ne mogu da procitam ${CONFIG_PATH}: ${e.message}`,
    );
    console.error(
      "[patch-watchsync] Da li si pokrenuo `npx cap sync ios` pre ove skripte?",
    );
    process.exit(1);
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch (e) {
    console.error(`[patch-watchsync] Nevalidan JSON u configu: ${e.message}`);
    process.exit(1);
  }

  if (!Array.isArray(config.packageClassList)) {
    config.packageClassList = [];
  }

  if (config.packageClassList.includes(PLUGIN_CLASS)) {
    console.log(
      `[patch-watchsync] ${PLUGIN_CLASS} je vec u packageClassList — nista za uraditi.`,
    );
    return;
  }

  config.packageClassList.push(PLUGIN_CLASS);

  // Sacuvaj sa tab indentacijom (kao postojeci fajl) + zavrsni newline.
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, "\t") + "\n", "utf8");
  console.log(
    `[patch-watchsync] Dodat ${PLUGIN_CLASS} u packageClassList → bridge ce biti registrovan.`,
  );
}

main();
