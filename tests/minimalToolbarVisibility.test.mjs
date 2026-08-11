import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const navSource = readFileSync(new URL('../src/components/navigation/NavFab.tsx', import.meta.url), 'utf8');
const minimalCss = readFileSync(new URL('../src/components/navigation/NavFabMinimal.css', import.meta.url), 'utf8');

test('minimal toolbar keeps every destination fully visible', () => {
  assert.match(minimalCss, /\.nav-fab--minimal \.nav-fab__item--dim \{[\s\S]*?opacity:\s*1;[\s\S]*?filter:\s*none;/);
  assert.match(minimalCss, /\.nav-fab--minimal \.nav-fab__item--dim::before \{\s*opacity:\s*1;/);
  assert.match(minimalCss, /--minimal-icon-color:\s*#f0bd55/);
  assert.match(minimalCss, /:root\[data-theme='light'\][\s\S]*?--minimal-icon-color:\s*#785014/);
});

test('minimal home hub renders a real high-contrast dollar mark', () => {
  assert.match(navSource, /className="nav-fab__minimal-home-mark"[^>]*>\$<\/span>/);
  assert.match(minimalCss, /\.nav-fab__minimal-home-mark \{[\s\S]*?z-index:\s*3;[\s\S]*?color:\s*var\(--minimal-icon-color\)/);
  assert.match(minimalCss, /\.nav-fab--minimal \.nav-fab__main--minimal::before \{\s*content:\s*none;/);
});

test('minimal create action keeps a dark cut-out plus on its gold disc', () => {
  assert.match(minimalCss, /\.nav-fab--minimal \.nav-fab__item--minimal-create::before \{[\s\S]*?background:\s*currentColor;/);
  assert.match(minimalCss, /\.nav-fab--minimal \.nav-fab__item--minimal-create \{\s*color:\s*#171009 !important;/);
  assert.match(minimalCss, /:root\[data-theme='light'\] \.nav-fab--minimal \.nav-fab__item--minimal-create \{\s*color:\s*#4a2e08 !important;/);
});
