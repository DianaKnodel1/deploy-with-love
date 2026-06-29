// Theme-Registry: HTML/CSS/JS als raw Strings, damit sie im Server-Function-Bundle
// (Cloudflare Workers) verfügbar sind — kein FS-Zugriff zur Laufzeit.

import sharedFormHtml from "../landing-themes/_shared/form-section.html?raw";
import sharedFormCss from "../landing-themes/_shared/form-section.css?raw";
import sharedFormJs from "../landing-themes/_shared/form-section.js?raw";
import azbFormHtml from "../landing-themes/_shared/form-section-azb.html?raw";
import azbFormCss from "../landing-themes/_shared/form-section-azb.css?raw";
import ttsFormHtml from "../landing-themes/_shared/form-section-tts.html?raw";
import ttsFormCss from "../landing-themes/_shared/form-section-tts.css?raw";
import eilFormHtml from "../landing-themes/_shared/form-section-eilers.html?raw";
import eilFormCss from "../landing-themes/_shared/form-section-eilers.css?raw";
import mirFormHtml from "../landing-themes/_shared/form-section-mirror.html?raw";
import mirFormCss from "../landing-themes/_shared/form-section-mirror.css?raw";



import t10Html from "../landing-themes/theme-10/template.html?raw";
import t10Css from "../landing-themes/theme-10/style.css?raw";
import t10Js from "../landing-themes/theme-10/script.js?raw";
import t10Meta from "../landing-themes/theme-10/meta.json";

import tttsHtml from "../landing-themes/theme-tts-consultant/template.html?raw";
import tttsCss from "../landing-themes/theme-tts-consultant/style.css?raw";
import tttsJs from "../landing-themes/theme-tts-consultant/script.js?raw";
import tttsMeta from "../landing-themes/theme-tts-consultant/meta.json";

import tpgHtml from "../landing-themes/theme-privacy-guardian/template.html?raw";
import tpgCss from "../landing-themes/theme-privacy-guardian/style.css?raw";
import tpgJs from "../landing-themes/theme-privacy-guardian/script.js?raw";
import tpgMeta from "../landing-themes/theme-privacy-guardian/meta.json";

import teilHtml from "../landing-themes/theme-eilers-replica/template.html?raw";
import teilCss from "../landing-themes/theme-eilers-replica/style.css?raw";
import teilJs from "../landing-themes/theme-eilers-replica/script.js?raw";
import teilMeta from "../landing-themes/theme-eilers-replica/meta.json";

import tazbRepHtml from "../landing-themes/theme-azb-replica/template.html?raw";
import tazbRepCss from "../landing-themes/theme-azb-replica/style.css?raw";
import tazbRepJs from "../landing-themes/theme-azb-replica/script.js?raw";
import tazbRepMeta from "../landing-themes/theme-azb-replica/meta.json";


import tmirHtml from "../landing-themes/theme-mirror-site/template.html?raw";
import tmirCss from "../landing-themes/theme-mirror-site/style.css?raw";
import tmirJs from "../landing-themes/theme-mirror-site/script.js?raw";
import tmirMeta from "../landing-themes/theme-mirror-site/meta.json";

export type ThemeSlot = {
  key: string;
  label: string;
  type: "text" | "longtext" | "image" | "color";
  default: string;
};

export type ThemeFiles = {
  id: string;
  name: string;
  description: string;
  html: string;
  css: string;
  js: string;
  slots: ThemeSlot[];
};

function pickSlots(meta: any): ThemeSlot[] {
  return Array.isArray(meta?.slots) ? (meta.slots as ThemeSlot[]) : [];
}

// Themes, die KEINE eigene Bewerbungs-Sektion haben (TTS/Eilers/AZB), bekommen
// das Shared-Formular automatisch vor </body> + zugehöriges CSS/JS injiziert.
// CTAs in diesen Themes zeigen auf #bewerbung-form.
// Inline-Bewerbungsformular wurde entfernt: Jedes Theme soll für sich stehen
// und CTAs verlinken auf die separate /bewerbung Seite (Portal). So bleibt die
// Landing übersichtlich und unterscheidet sich klar pro Theme.
// Referenzen behalten, damit Vite die Imports nicht als unused entfernt.
void sharedFormHtml; void sharedFormCss; void sharedFormJs;
void azbFormHtml; void azbFormCss; void ttsFormHtml; void ttsFormCss;
void eilFormHtml; void eilFormCss; void mirFormHtml; void mirFormCss;

function withSharedForm(t: ThemeFiles): ThemeFiles {
  return t;
}


export const THEMES: ThemeFiles[] = [
  { id: t10Meta.id, name: t10Meta.name, description: t10Meta.description, html: t10Html, css: t10Css, js: t10Js, slots: pickSlots(t10Meta) },
  { id: tttsMeta.id, name: tttsMeta.name, description: tttsMeta.description, html: tttsHtml, css: tttsCss, js: tttsJs, slots: pickSlots(tttsMeta) },
  { id: tpgMeta.id, name: tpgMeta.name, description: tpgMeta.description, html: tpgHtml, css: tpgCss, js: tpgJs, slots: pickSlots(tpgMeta) },
  { id: teilMeta.id, name: teilMeta.name, description: teilMeta.description, html: teilHtml, css: teilCss, js: teilJs, slots: pickSlots(teilMeta) },
  { id: tazbRepMeta.id, name: tazbRepMeta.name, description: tazbRepMeta.description, html: tazbRepHtml, css: tazbRepCss, js: tazbRepJs, slots: pickSlots(tazbRepMeta) },
  { id: tmirMeta.id, name: tmirMeta.name, description: tmirMeta.description, html: tmirHtml, css: tmirCss, js: tmirJs, slots: pickSlots(tmirMeta) },
].map(withSharedForm);


export function getTheme(id: string): ThemeFiles | undefined {
  return THEMES.find((t) => t.id === id);
}

export const THEME_LIST = THEMES.map((t) => ({
  id: t.id,
  name: t.name,
  description: t.description,
  slots: t.slots,
}));
