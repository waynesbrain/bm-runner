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

const toolbarPicker = document.getElementById('toolbar-picker') as HTMLSelectElement;
const toolbarCsp = document.getElementById('toolbar-csp') as HTMLInputElement;
const debugToggle = document.getElementById('debug-toggle') as HTMLInputElement;
const shortcutSlots = document.getElementById('shortcut-slots') as HTMLDivElement;
const emptyState = document.getElementById('empty-state') as HTMLElement;
const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
const saveStatus = document.getElementById('save-status') as HTMLSpanElement;

const SHORTCUT_COMMANDS = [
  'run-bookmarklet-1',
  'run-bookmarklet-2',
  'run-bookmarklet-3',
];

let currentConfig: AppConfig | null = null;
let bookmarklets: BookmarkletInfo[] = [];

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

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
  populateShortcutSlots();

  // Set debug toggle from stored config
  debugToggle.checked = currentConfig!.debugEnabled;

  bindEvents();
}

function renderToolbarSection(): void {
  // Populate the toolbar picker
  populatePicker(toolbarPicker, currentConfig!.toolbarBookmarklet);

  // Set CSP checkbox state based on the currently selected bookmarklet
  updateToolbarCspCheckbox();
}

function renderShortcutSection(): void {
  // CSP checkboxes will be set when we populate the slots
}

// ---------------------------------------------------------------------------
// Populate pickers
// ---------------------------------------------------------------------------

function populatePicker(
  select: HTMLSelectElement,
  selectedId: string | null,
): void {
  // Clear existing options (keep the first "(none)" option)
  while (select.options.length > 1) {
    select.options.remove(1);
  }

  for (const bm of bookmarklets) {
    const option = document.createElement('option');
    option.value = bm.id;
    option.textContent = `${bm.title} (${truncateUrl(bm.url)})`;
    if (bm.id === selectedId) {
      option.selected = true;
    }
    select.appendChild(option);
  }

  if (selectedId === null) {
    select.value = '';
  }
}

function populateShortcutSlots(): void {
  shortcutSlots.innerHTML = '';

  for (let i = 0; i < SHORTCUT_COMMANDS.length; i++) {
    const command = SHORTCUT_COMMANDS[i]!;
    const assignedId = currentConfig!.shortcutBookmarklets[command] ?? null;

    const container = document.createElement('div');
    container.className = 'field shortcut-field';

    const label = document.createElement('label');
    label.htmlFor = `shortcut-${i}`;
    // The suggested key is in the manifest; we don't hardcode it here since
    // the user may have remapped it in chrome://extensions/shortcuts.
    label.textContent = `Shortcut #${i + 1}:`;

    const select = document.createElement('select');
    select.id = `shortcut-${i}`;
    select.dataset.command = command;

    const noneOption = document.createElement('option');
    noneOption.value = '';
    noneOption.textContent = '(none selected)';
    select.appendChild(noneOption);

    for (const bm of bookmarklets) {
      const option = document.createElement('option');
      option.value = bm.id;
      option.textContent = `${bm.title} (${truncateUrl(bm.url)})`;
      if (bm.id === assignedId) {
        option.selected = true;
      }
      select.appendChild(option);
    }

    if (assignedId === null) {
      select.value = '';
    }

    const cspLabel = document.createElement('label');
    cspLabel.className = 'checkbox-label';

    const cspCheckbox = document.createElement('input');
    cspCheckbox.type = 'checkbox';
    cspCheckbox.dataset.command = command;
    cspCheckbox.className = 'csp-checkbox';
    // CSP checkbox state is updated via updateShortcutCspCheckboxes

    cspLabel.appendChild(cspCheckbox);
    cspLabel.appendChild(document.createTextNode(' Disable CSP'));

    container.appendChild(label);
    container.appendChild(select);
    container.appendChild(cspLabel);
    shortcutSlots.appendChild(container);
  }

  updateShortcutCspCheckboxes();
}

// ---------------------------------------------------------------------------
// CSP checkbox updates
// ---------------------------------------------------------------------------

function updateToolbarCspCheckbox(): void {
  const selectedId = toolbarPicker.value;
  if (selectedId) {
    toolbarCsp.checked = currentConfig!.cspDisabled[selectedId] ?? false;
  } else {
    toolbarCsp.checked = false;
  }
}

function updateShortcutCspCheckboxes(): void {
  for (let i = 0; i < SHORTCUT_COMMANDS.length; i++) {
    const command = SHORTCUT_COMMANDS[i]!;
    const select = document.getElementById(`shortcut-${i}`) as HTMLSelectElement;
    const checkbox = shortcutSlots.querySelector<HTMLInputElement>(
      `input.csp-checkbox[data-command="${command}"]`,
    );
    if (checkbox && select) {
      const selectedId = select.value;
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
  // Update CSP checkbox when toolbar picker changes
  toolbarPicker.addEventListener('change', () => {
    updateToolbarCspCheckbox();
  });

  // Update CSP checkbox when any shortcut picker changes
  shortcutSlots.addEventListener('change', (e) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'SELECT' && target.id.startsWith('shortcut-')) {
      updateShortcutCspCheckboxes();
    }
  });

  // Save button
  saveBtn.addEventListener('click', () => {
    saveSettings();
  });

  // Shortcuts link (can't navigate directly to chrome:// URLs from a web page)
  for (const link of ['shortcuts-link', 'shortcuts-link-footer']) {
    document.getElementById(link)?.addEventListener('click', (e) => {
      e.preventDefault();
      // Write to clipboard
      navigator.clipboard.writeText('chrome://extensions/shortcuts').then(() => {
        showStatus('Copied! Paste into your address bar.', 'success');
      }).catch(() => {
        showStatus('Go to chrome://extensions/shortcuts in your address bar.', '');
      });
    });
  }
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

async function saveSettings(): Promise<void> {
  // Gather toolbar selection
  const toolbarSelection = toolbarPicker.value || null;

  // Gather shortcut selections
  const shortcutSelections: Record<string, string | null> = {};
  for (let i = 0; i < SHORTCUT_COMMANDS.length; i++) {
    const command = SHORTCUT_COMMANDS[i]!;
    const select = document.getElementById(`shortcut-${i}`) as HTMLSelectElement;
    shortcutSelections[command] = select.value || null;
  }

  // Gather CSP disabled flags
  const cspDisabled: Record<string, boolean> = { ...currentConfig!.cspDisabled };

  // Update CSP flag for toolbar selection
  if (toolbarSelection) {
    cspDisabled[toolbarSelection] = toolbarCsp.checked;
  }

  // Update CSP flags for shortcuts
  for (let i = 0; i < SHORTCUT_COMMANDS.length; i++) {
    const command = SHORTCUT_COMMANDS[i]!;
    const select = document.getElementById(`shortcut-${i}`) as HTMLSelectElement;
    const checkbox = shortcutSlots.querySelector<HTMLInputElement>(
      `input.csp-checkbox[data-command="${command}"]`,
    );
    const selectedId = select.value || null;
    if (selectedId && checkbox) {
      cspDisabled[selectedId] = checkbox.checked;
    }
  }

  // Clean up CSP flags for bookmarklets that are no longer assigned anywhere
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

  await saveConfig(newConfig);
  currentConfig = newConfig;
  showStatus('Saved!', 'success');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateUrl(url: string, maxLen = 50): string {
  if (url.length <= maxLen) return url;
  return url.slice(0, maxLen - 3) + '...';
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
