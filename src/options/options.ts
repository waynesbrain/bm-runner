/// <reference types="chrome" />

import {
  getAllBookmarklets,
  loadConfig,
  saveConfig,
  type BookmarkletInfo,
  type AppConfig,
} from '../lib/bookmarklet-utils.js';

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------

const toolbarPickerContainer = document.getElementById('toolbar-picker-container')!;
const toolbarCsp = document.getElementById('toolbar-csp') as HTMLInputElement;
const debugToggle = document.getElementById('debug-toggle') as HTMLInputElement;
const shortcutSlots = document.getElementById('shortcut-slots') as HTMLDivElement;
const emptyState = document.getElementById('empty-state') as HTMLElement;
const saveStatus = document.getElementById('save-status') as HTMLSpanElement;
const undoBtn = document.getElementById('undo-btn') as HTMLButtonElement;

const undoStack: AppConfig[] = [];

const SHORTCUT_COMMANDS = [
  'run-bookmarklet-1',
  'run-bookmarklet-2',
  'run-bookmarklet-3',
];

let currentConfig: AppConfig | null = null;
let bookmarklets: BookmarkletInfo[] = [];

// ---------------------------------------------------------------------------
// Custom select component
// ---------------------------------------------------------------------------

interface CustomSelect {
  /** The wrapper element (exposes a .value property and dispatches 'change') */
  el: HTMLElement;
  /** Set the selected bookmarklet ID (null = none). Does NOT fire change. */
  setValue(id: string | null): void;
  /** Get the currently selected bookmarklet ID ('' = none). */
  getValue(): string;
  /** Refresh the option list (e.g. after bookmarklets are reloaded). */
  setOptions(items: BookmarkletInfo[]): void;
}

/**
 * Build a custom dropdown that shows bold title + gray right-aligned path
 * for each bookmarklet option.
 */
function createCustomSelect(selectedId: string | null): CustomSelect {
  let value = selectedId ?? '';
  let options: BookmarkletInfo[] = [...bookmarklets];
  let open = false;

  // Wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'custom-select';

  // Trigger
  const trigger = document.createElement('div');
  trigger.className = 'custom-select-trigger';
  trigger.tabIndex = 0;

  const triggerText = document.createElement('span');
  triggerText.className = 'custom-select-trigger-text';

  const arrow = document.createElement('span');
  arrow.className = 'custom-select-arrow';
  arrow.textContent = '▾';

  trigger.appendChild(triggerText);
  trigger.appendChild(arrow);
  wrapper.appendChild(trigger);

  // Dropdown
  const dropdown = document.createElement('div');
  dropdown.className = 'custom-select-dropdown';
  wrapper.appendChild(dropdown);

  // --- Methods ---

  function renderSelected(): void {
    triggerText.innerHTML = '';
    if (value) {
      const bm = options.find((b) => b.id === value);
      if (bm) {
        const titleSpan = document.createElement('span');
        titleSpan.className = 'custom-select-title';
        titleSpan.textContent = bm.title;

        const pathSpan = document.createElement('span');
        pathSpan.className = 'custom-select-path';
        pathSpan.textContent = bm.path;

        triggerText.appendChild(titleSpan);
        triggerText.appendChild(pathSpan);
      } else {
        triggerText.textContent = '(deleted)';
      }
    } else {
      triggerText.textContent = '(none selected)';
    }
  }

  function renderOptions(): void {
    dropdown.innerHTML = '';

    // None option
    const noneItem = document.createElement('div');
    noneItem.className = 'custom-select-option' + (value === '' ? ' selected' : '');
    noneItem.textContent = '(none selected)';
    noneItem.addEventListener('click', () => select(''));
    dropdown.appendChild(noneItem);

    for (const bm of options) {
      const item = document.createElement('div');
      item.className = 'custom-select-option' + (bm.id === value ? ' selected' : '');

      const titleSpan = document.createElement('span');
      titleSpan.className = 'custom-select-title';
      titleSpan.textContent = bm.title;

      const pathSpan = document.createElement('span');
      pathSpan.className = 'custom-select-path';
      pathSpan.textContent = bm.path;

      item.appendChild(titleSpan);
      item.appendChild(pathSpan);
      item.addEventListener('click', () => select(bm.id));
      dropdown.appendChild(item);
    }
  }

  function select(id: string): void {
    if (value !== id) {
      value = id;
      renderSelected();
      renderOptions();
    }
    close();
    wrapper.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function openDropdown(): void {
    open = true;
    dropdown.classList.add('open');
    renderOptions();
  }

  function close(): void {
    open = false;
    dropdown.classList.remove('open');
  }

  // --- Events ---

  trigger.addEventListener('click', () => {
    if (open) close();
    else openDropdown();
  });

  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (open) close();
      else openDropdown();
    }
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target as Node)) {
      close();
    }
  });

  // --- Init ---

  renderSelected();

  return {
    el: wrapper,
    setValue(id: string | null): void {
      value = id ?? '';
      renderSelected();
    },
    getValue(): string {
      return value;
    },
    setOptions(items: BookmarkletInfo[]): void {
      options = items;
      // If current value no longer exists, clear it
      if (value && !options.some((b) => b.id === value)) {
        value = '';
      }
      renderSelected();
    },
  };
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

let toolbarSelect: CustomSelect;
const shortcutSelects: CustomSelect[] = [];

async function init(): Promise<void> {
  [bookmarklets, currentConfig] = await Promise.all([
    getAllBookmarklets(),
    loadConfig(),
  ]);

  if (bookmarklets.length === 0) {
    emptyState.style.display = '';
  }

  renderToolbarSection();
  renderShortcutSection();

  // Set debug toggle from stored config
  debugToggle.checked = currentConfig!.debugEnabled;

  bindEvents();
}

function renderToolbarSection(): void {
  toolbarSelect = createCustomSelect(currentConfig!.toolbarBookmarklet);
  toolbarPickerContainer.appendChild(toolbarSelect.el);
  updateToolbarCspCheckbox();
}

function renderShortcutSection(): void {
  shortcutSlots.innerHTML = '';

  for (let i = 0; i < SHORTCUT_COMMANDS.length; i++) {
    const command = SHORTCUT_COMMANDS[i]!;
    const assignedId = currentConfig!.shortcutBookmarklets[command] ?? null;

    const container = document.createElement('div');
    container.className = 'field shortcut-field';

    const label = document.createElement('label');
    label.textContent = `Shortcut #${i + 1}:`;

    const sel = createCustomSelect(assignedId);
    shortcutSelects.push(sel);
    sel.el.dataset.command = command;

    const cspLabel = document.createElement('label');
    cspLabel.className = 'checkbox-label';

    const cspCheckbox = document.createElement('input');
    cspCheckbox.type = 'checkbox';
    cspCheckbox.dataset.command = command;
    cspCheckbox.className = 'csp-checkbox';

    cspLabel.appendChild(cspCheckbox);
    cspLabel.appendChild(document.createTextNode(' Disable CSP'));

    container.appendChild(label);
    container.appendChild(sel.el);
    container.appendChild(cspLabel);
    shortcutSlots.appendChild(container);
  }

  updateShortcutCspCheckboxes();
}

// ---------------------------------------------------------------------------
// CSP checkbox updates
// ---------------------------------------------------------------------------

function updateToolbarCspCheckbox(): void {
  const selectedId = toolbarSelect.getValue();
  if (selectedId) {
    toolbarCsp.checked = currentConfig!.cspDisabled[selectedId] ?? false;
  } else {
    toolbarCsp.checked = false;
  }
}

function updateShortcutCspCheckboxes(): void {
  for (const sel of shortcutSelects) {
    const command = sel.el.dataset.command!;
    const checkbox = shortcutSlots.querySelector<HTMLInputElement>(
      `input.csp-checkbox[data-command="${command}"]`,
    );
    if (checkbox) {
      const selectedId = sel.getValue();
      if (selectedId) {
        checkbox.checked = currentConfig!.cspDisabled[selectedId] ?? false;
      } else {
        checkbox.checked = false;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function bindEvents(): void {
  const autoSave = debounce(() => saveSettings(), 400);

  // Toolbar picker: update CSP checkbox + auto-save
  toolbarSelect.el.addEventListener('change', () => {
    updateToolbarCspCheckbox();
    autoSave();
  });

  // Toolbar CSP checkbox: auto-save
  toolbarCsp.addEventListener('change', () => {
    autoSave();
  });

  // Shortcut pickers: update CSP checkboxes + auto-save
  for (const sel of shortcutSelects) {
    sel.el.addEventListener('change', () => {
      updateShortcutCspCheckboxes();
      autoSave();
    });
  }

  // Shortcut CSP checkboxes: auto-save
  for (const sel of shortcutSelects) {
    const command = sel.el.dataset.command!;
    const checkbox = shortcutSlots.querySelector<HTMLInputElement>(
      `input.csp-checkbox[data-command="${command}"]`,
    );
    if (checkbox) {
      checkbox.addEventListener('change', () => {
        autoSave();
      });
    }
  }

  // Debug toggle: auto-save
  debugToggle.addEventListener('change', () => {
    autoSave();
  });

  // Undo button
  undoBtn.addEventListener('click', () => {
    undoLastChange();
  });

  // Shortcuts link
  for (const link of ['shortcuts-link', 'shortcuts-link-footer']) {
    document.getElementById(link)?.addEventListener('click', (e) => {
      e.preventDefault();
      navigator.clipboard.writeText('chrome://extensions/shortcuts').then(() => {
        showStatus('Copied! Paste into your address bar.', 'success');
      }).catch(() => {
        showStatus('Go to chrome://extensions/shortcuts in your address bar.', '');
      });
    });
  }

  // Extensions URL
  const extUrl = document.getElementById('extensions-url');
  if (extUrl) {
    const url = `chrome://extensions/?id=${chrome.runtime.id}`;
    extUrl.textContent = url;
    extUrl.addEventListener('click', () => {
      navigator.clipboard.writeText(url).then(() => {
        showStatus('Copied! Paste into your address bar.', 'success');
      }).catch(() => {
        showStatus(`Go to ${url} in your address bar.`, '');
      });
    });
  }
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

async function saveSettings(): Promise<void> {
  const toolbarSelection = toolbarSelect.getValue() || null;

  const shortcutSelections: Record<string, string | null> = {};
  for (const sel of shortcutSelects) {
    const command = sel.el.dataset.command!;
    shortcutSelections[command] = sel.getValue() || null;
  }

  const cspDisabled: Record<string, boolean> = { ...currentConfig!.cspDisabled };

  if (toolbarSelection) {
    cspDisabled[toolbarSelection] = toolbarCsp.checked;
  }

  for (const sel of shortcutSelects) {
    const command = sel.el.dataset.command!;
    const checkbox = shortcutSlots.querySelector<HTMLInputElement>(
      `input.csp-checkbox[data-command="${command}"]`,
    );
    const selectedId = sel.getValue() || null;
    if (selectedId && checkbox) {
      cspDisabled[selectedId] = checkbox.checked;
    }
  }

  // Clean up CSP flags for unassigned bookmarklets
  const assignedIds = new Set<string>();
  if (toolbarSelection) assignedIds.add(toolbarSelection);
  for (const id of Object.values(shortcutSelections)) {
    if (id) assignedIds.add(id);
  }
  for (const key of Object.keys(cspDisabled)) {
    if (!assignedIds.has(key)) {
      delete cspDisabled[key];
    }
  }

  const newConfig: AppConfig = {
    toolbarBookmarklet: toolbarSelection,
    shortcutBookmarklets: shortcutSelections,
    cspDisabled,
    debugEnabled: debugToggle.checked,
  };

  // Push current state for undo before overwriting
  if (currentConfig) {
    undoStack.push(structuredClone(currentConfig));
    updateUndoButton();
  }

  await saveConfig(newConfig);
  currentConfig = newConfig;
  showStatus('Saved', 'success');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function updateUndoButton(): void {
  undoBtn.disabled = undoStack.length === 0;
}

function undoLastChange(): void {
  if (undoStack.length === 0) return;

  const previousConfig = undoStack.pop()!;
  updateUndoButton();

  // Restore UI to the previous state
  applyConfig(previousConfig);

  // Persist the undone state
  saveConfig(previousConfig);
  currentConfig = previousConfig;
  showStatus('Undone', 'success');
}

/** Apply a config snapshot to all UI controls without firing change events. */
function applyConfig(config: AppConfig): void {
  // Toolbar picker
  toolbarSelect.setValue(config.toolbarBookmarklet);
  updateToolbarCspCheckbox();

  // Shortcut pickers
  for (const sel of shortcutSelects) {
    const command = sel.el.dataset.command!;
    sel.setValue(config.shortcutBookmarklets[command] ?? null);
  }
  updateShortcutCspCheckboxes();

  // Debug toggle
  debugToggle.checked = config.debugEnabled;
}

function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

function showStatus(message: string, className: string): void {
  saveStatus.textContent = message;
  saveStatus.className = className;
  setTimeout(() => {
    saveStatus.textContent = '';
    saveStatus.className = '';
  }, 2500);
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

init();
