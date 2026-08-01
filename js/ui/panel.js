/**
 * panel.js — builds the control panel from controls.js and reports changes.
 *
 * Knows nothing about the image engine. It emits onChange(id, value) whenever a
 * control moves, including on every step of a drag — the engine renders the
 * same way during a drag as after it, so the panel does not need to
 * distinguish the two.
 */

import { CONTROL_GROUPS, ALL_CONTROLS } from './controls.js';

export class Panel {
  /**
   * @param {HTMLElement} root  container to build into
   * @param {(id, value) => void} onChange
   */
  constructor(root, onChange) {
    this.root = root;
    this.onChange = onChange;
    this.inputs = new Map(); // id -> { input, valueEl, row }
    this.build();
  }

  build() {
    this.root.innerHTML = '';

    CONTROL_GROUPS.forEach((group, i) => {
      const section = el('section', 'group');

      // Groups are numbered because the panel reads top to bottom as the order
      // you actually edit in — see the header comment in controls.js.
      const title = el('h2', 'group__title');
      title.appendChild(el('span', 'group__step', String(i + 1).padStart(2, '0')));
      title.appendChild(el('span', 'group__name', group.label));
      section.appendChild(title);

      for (const control of group.controls) {
        section.appendChild(this.buildControl(control));
      }
      this.root.appendChild(section);
    });
  }

  buildControl(c) {
    const row = el('div', `control control--${c.type}`);
    row.dataset.control = c.id;

    const head = el('div', 'control__head');
    head.appendChild(el('label', 'control__label', c.label));

    const valueEl = el('span', 'control__value');
    head.appendChild(valueEl);
    row.appendChild(head);

    let input;

    if (c.type === 'range') {
      input = el('input', 'control__range');
      input.type = 'range';
      input.min = c.min;
      input.max = c.max;
      input.step = c.step;

      // `input` covers dragging, clicking the track and keyboard arrows alike.
      input.addEventListener('input', () => {
        valueEl.textContent = formatValue(c, Number(input.value));
        this.onChange(c.id, Number(input.value));
      });

      // Double click a slider to send it home.
      input.addEventListener('dblclick', () => {
        input.value = c.default;
        valueEl.textContent = formatValue(c, c.default);
        this.onChange(c.id, c.default);
      });

      row.appendChild(input);
    } else if (c.type === 'select') {
      input = el('select', 'control__select');
      for (const o of c.options) {
        const opt = el('option', '', o.label);
        opt.value = o.value;
        input.appendChild(opt);
      }
      input.addEventListener('change', () => this.onChange(c.id, input.value));
      row.appendChild(input);
      valueEl.remove();
    } else if (c.type === 'toggle') {
      input = el('input', 'control__toggle');
      input.type = 'checkbox';
      input.id = `toggle-${c.id}`;

      const track = el('label', 'switch');
      track.setAttribute('for', input.id);
      track.appendChild(el('span', 'switch__knob'));

      input.addEventListener('change', () => this.onChange(c.id, input.checked));
      head.appendChild(track);
      row.appendChild(input);
      valueEl.remove();
    }

    if (c.hint) row.appendChild(el('p', 'control__hint', c.hint));

    this.inputs.set(c.id, { control: c, input, valueEl, row });
    return row;
  }

  /** Push a full parameter object into the widgets. */
  sync(params) {
    for (const [id, entry] of this.inputs) {
      const { control, input, valueEl } = entry;
      const v = params[id];

      if (control.type === 'toggle') {
        input.checked = !!v;
        // The switch graphic is driven by this class, not by :checked — the
        // checkbox is not a CSS sibling of the switch in this markup.
        entry.row.classList.toggle('is-on', !!v);
      } else {
        if (String(input.value) !== String(v)) input.value = v;
        if (valueEl) valueEl.textContent = formatValue(control, v);
      }

      // showIf lets a control disappear when it cannot do anything.
      const visible = !control.showIf || control.showIf(params);
      entry.row.classList.toggle('is-hidden', !visible);

      // Mark non-default controls so the user can see what they have touched.
      const touched = v !== control.default;
      entry.row.classList.toggle('is-modified', touched);
    }
  }
}

function formatValue(c, v) {
  if (c.type !== 'range') return '';
  const sign = c.min < 0 && v > 0 ? '+' : '';
  return `${sign}${v}${c.unit || ''}`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/** Clamp an arbitrary object back into legal parameter ranges. */
export function sanitiseParams(raw) {
  const out = {};
  for (const c of ALL_CONTROLS) {
    const v = raw?.[c.id];
    if (v == null) {
      out[c.id] = c.default;
    } else if (c.type === 'range') {
      const n = Number(v);
      out[c.id] = Number.isFinite(n) ? Math.min(c.max, Math.max(c.min, n)) : c.default;
    } else if (c.type === 'toggle') {
      out[c.id] = !!v;
    } else if (c.type === 'select') {
      out[c.id] = c.options.some((o) => o.value === v) ? v : c.default;
    }
  }
  return out;
}
