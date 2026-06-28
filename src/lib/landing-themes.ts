// Theme-Registry: HTML/CSS/JS als raw Strings, damit sie im Server-Function-Bundle
// (Cloudflare Workers) verfügbar sind — kein FS-Zugriff zur Laufzeit.

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

import tazbHtml from "../landing-themes/theme-azb-personal/template.html?raw";
import tazbCss from "../landing-themes/theme-azb-personal/style.css?raw";
import tazbJs from "../landing-themes/theme-azb-personal/script.js?raw";
import tazbMeta from "../landing-themes/theme-azb-personal/meta.json";

import tysywHtml from "../landing-themes/theme-your-site-your-way/template.html?raw";
import tysywCss from "../landing-themes/theme-your-site-your-way/style.css?raw";
import tysywJs from "../landing-themes/theme-your-site-your-way/script.js?raw";
import tysywMeta from "../landing-themes/theme-your-site-your-way/meta.json";

import teilHtml from "../landing-themes/theme-eilers-replica/template.html?raw";
import teilCss from "../landing-themes/theme-eilers-replica/style.css?raw";
import teilJs from "../landing-themes/theme-eilers-replica/script.js?raw";
import teilMeta from "../landing-themes/theme-eilers-replica/meta.json";


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

export const THEMES: ThemeFiles[] = [
  { id: t10Meta.id, name: t10Meta.name, description: t10Meta.description, html: t10Html, css: t10Css, js: t10Js, slots: pickSlots(t10Meta) },
  { id: tttsMeta.id, name: tttsMeta.name, description: tttsMeta.description, html: tttsHtml, css: tttsCss, js: tttsJs, slots: pickSlots(tttsMeta) },
  { id: tpgMeta.id, name: tpgMeta.name, description: tpgMeta.description, html: tpgHtml, css: tpgCss, js: tpgJs, slots: pickSlots(tpgMeta) },
  { id: tazbMeta.id, name: tazbMeta.name, description: tazbMeta.description, html: tazbHtml, css: tazbCss, js: tazbJs, slots: pickSlots(tazbMeta) },
  { id: tysywMeta.id, name: tysywMeta.name, description: tysywMeta.description, html: tysywHtml, css: tysywCss, js: tysywJs, slots: pickSlots(tysywMeta) },
  { id: teilMeta.id, name: teilMeta.name, description: teilMeta.description, html: teilHtml, css: teilCss, js: teilJs, slots: pickSlots(teilMeta) },
  
  { id: tmirMeta.id, name: tmirMeta.name, description: tmirMeta.description, html: tmirHtml, css: tmirCss, js: tmirJs, slots: pickSlots(tmirMeta) },
];

export function getTheme(id: string): ThemeFiles | undefined {
  return THEMES.find((t) => t.id === id);
}

export const THEME_LIST = THEMES.map((t) => ({
  id: t.id,
  name: t.name,
  description: t.description,
  slots: t.slots,
}));
