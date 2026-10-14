import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';

function element(dataset = {}) {
  const listeners = {};
  return {
    dataset,
    listeners,
    attributes: {},
    style: {},
    classList: { toggle() {} },
    addEventListener(type, listener) { listeners[type] = listener; },
    setAttribute(name, value) { this.attributes[name] = value; },
    append(...children) { this.children = [...(this.children ?? []), ...children]; },
    replaceChildren() { this.children = []; },
  };
}

it('keeps each algorithm quota when switching tabs', async () => {
  const selectors = [
    '#algorithm-description', '#result-list', '#empty-state', '#result-count',
    '#quota-label', '#quota-progress', '#quota-fill', '#request-error',
    '#send-one', '#send-batch', '#reset',
  ];
  const elements = Object.fromEntries(selectors.map((selector) => [selector, element()]));
  const tabs = ['fixed-window', 'sliding-log', 'token-bucket'].map((algorithm) => element({ algorithm }));
  const buttons = ['#send-one', '#send-batch', '#reset'].map((selector) => elements[selector]);
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const document = {
    querySelector: (selector) => elements[selector],
    querySelectorAll: (selector) => selector === '[data-algorithm]' ? tabs : buttons,
    createElement: () => element(),
  };

  runInNewContext(source, {
    document,
    localStorage: { getItem: () => null, setItem() {} },
    crypto: { randomUUID: () => 'test-client' },
    fetch: async () => ({
      status: 200,
      ok: true,
      json: async () => ({ remaining: 9 }),
    }),
  });

  await elements['#send-one'].listeners.click();
  await tabs[1].listeners.click();
  await tabs[0].listeners.click();

  expect(elements['#quota-label'].textContent).toBe('9 / 10 remaining');
});

it('animates only the quota progress bar', async () => {
  const css = await readFile(new URL('../public/style.css', import.meta.url), 'utf8');
  expect(css.match(/transition:/g)).toHaveLength(1);
  expect(css).toMatch(/\.progress-fill\s*\{[^}]*transition:/s);
});
